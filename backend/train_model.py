import argparse
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import torch
from sklearn.metrics import accuracy_score
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from app.collection import GESTURE_LABELS
from app.sequence_model import (
    DEFAULT_MODEL_CONFIG,
    MODEL_FORMAT_VERSION,
    PREPROCESSING_CONFIG,
    GestureGRU,
)
from app.training import (
    DatasetValidationError,
    InsufficientSessionsError,
    evaluate_predictions,
    load_training_data,
    make_grouped_splits,
    make_stratified_pilot_splits,
    save_json,
)

BACKEND_DIR = Path(__file__).resolve().parent
MODELS_DIR = BACKEND_DIR / "models"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a session-grouped five-class gesture GRU.")
    parser.add_argument("--dataset", type=Path, default=BACKEND_DIR / "data" / "gesture_samples.jsonl")
    parser.add_argument("--model", type=Path, default=MODELS_DIR / "gesture_gru.pt")
    parser.add_argument("--labels", type=Path, default=MODELS_DIR / "gesture_labels.json")
    parser.add_argument("--preprocessing", type=Path, default=MODELS_DIR / "gesture_preprocessing.json")
    parser.add_argument("--evaluation", type=Path, default=MODELS_DIR / "gesture_evaluation.json")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--patience", type=int, default=12)
    parser.add_argument(
        "--same-session-pilot",
        action="store_true",
        help="Allow stratified random splits when data has one session; metrics are pilot-only, not independent evaluation.",
    )
    parser.add_argument("--overwrite", action="store_true", help="Replace existing model artifacts after successful evaluation.")
    return parser.parse_args()


def run_training(args: argparse.Namespace) -> dict[str, Any]:
    if args.epochs < 1 or args.batch_size < 1 or args.patience < 1:
        raise ValueError("epochs, batch size, and patience must be positive.")
    destinations = (args.model, args.labels, args.preprocessing, args.evaluation)
    existing = [str(path) for path in destinations if path.exists()]
    if existing and not args.overwrite:
        raise FileExistsError(
            "Refusing to overwrite existing model artifacts: " + ", ".join(existing) + ". Pass --overwrite explicitly."
        )

    data = load_training_data(args.dataset)
    session_ids = sorted(set(data.sessions.tolist()))
    if len(session_ids) < 3:
        if not args.same_session_pilot:
            raise InsufficientSessionsError(
                f"Found {len(session_ids)} recording session. Session-independent evaluation requires at least 3. "
                "Use --same-session-pilot only for a clearly labeled exploratory same-session result."
            )
        splits = make_stratified_pilot_splits(data, seed=args.seed)
        evaluation_kind = "same_session_stratified_pilot"
        evaluation_warning = (
            "Exploratory random sample split from a single recording session. "
            "These results are not session-independent, signer-independent, or evidence of real-world accuracy."
        )
    else:
        splits = make_grouped_splits(data, seed=args.seed)
        evaluation_kind = "session_grouped_held_out"
        evaluation_warning = (
            "Held-out recording sessions only; broader signer-independent performance is not established."
        )

    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    label_to_index = {label: index for index, label in enumerate(GESTURE_LABELS)}
    encoded_labels = np.asarray([label_to_index[label] for label in data.labels], dtype=np.int64)
    x_train = torch.from_numpy(data.features[splits.train])
    y_train = torch.from_numpy(encoded_labels[splits.train])
    x_validation = torch.from_numpy(data.features[splits.validation])
    y_validation = torch.from_numpy(encoded_labels[splits.validation])
    x_test = torch.from_numpy(data.features[splits.test])
    y_test = encoded_labels[splits.test]
    train_loader = DataLoader(
        TensorDataset(x_train, y_train),
        batch_size=args.batch_size,
        shuffle=True,
    )

    model = GestureGRU(**DEFAULT_MODEL_CONFIG, num_classes=len(GESTURE_LABELS))
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001, weight_decay=1e-4)
    loss_function = nn.CrossEntropyLoss()
    best_state: dict[str, torch.Tensor] | None = None
    best_validation_loss = float("inf")
    epochs_without_improvement = 0
    best_epoch = 0

    for epoch in range(1, args.epochs + 1):
        model.train()
        for batch_features, batch_labels in train_loader:
            optimizer.zero_grad(set_to_none=True)
            loss = loss_function(model(batch_features), batch_labels)
            loss.backward()
            optimizer.step()

        model.eval()
        with torch.inference_mode():
            validation_loss = float(loss_function(model(x_validation), y_validation))
        if validation_loss < best_validation_loss:
            best_validation_loss = validation_loss
            best_state = {
                name: tensor.detach().cpu().clone()
                for name, tensor in model.state_dict().items()
            }
            best_epoch = epoch
            epochs_without_improvement = 0
        else:
            epochs_without_improvement += 1
            if epochs_without_improvement >= args.patience:
                break

    if best_state is None:
        raise RuntimeError("Training did not produce a validation checkpoint.")
    model.load_state_dict(best_state)
    model.eval()
    with torch.inference_mode():
        validation_predictions = torch.argmax(model(x_validation), dim=1).cpu().numpy()
    validation_accuracy = float(accuracy_score(data.labels[splits.validation], np.asarray(GESTURE_LABELS)[validation_predictions]))

    development_indices = np.concatenate((splits.train, splits.validation))
    x_development = torch.from_numpy(data.features[development_indices])
    y_development = torch.from_numpy(encoded_labels[development_indices])
    final_loader = DataLoader(
        TensorDataset(x_development, y_development),
        batch_size=args.batch_size,
        shuffle=True,
    )
    torch.manual_seed(args.seed)
    model = GestureGRU(**DEFAULT_MODEL_CONFIG, num_classes=len(GESTURE_LABELS))
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001, weight_decay=1e-4)
    for _ in range(best_epoch):
        model.train()
        for batch_features, batch_labels in final_loader:
            optimizer.zero_grad(set_to_none=True)
            loss = loss_function(model(batch_features), batch_labels)
            loss.backward()
            optimizer.step()
    with torch.inference_mode():
        test_logits = model(x_test)
        predicted_indices = torch.argmax(test_logits, dim=1).cpu().numpy()
    index_to_label = np.asarray(GESTURE_LABELS)
    test_predictions = index_to_label[predicted_indices]
    evaluation = evaluate_predictions(data.labels[splits.test], test_predictions)
    evaluation["test_sample_count"] = int(len(splits.test))
    evaluation["test_session_ids"] = sorted(set(data.sessions[splits.test].tolist()))
    evaluation["evaluation_kind"] = evaluation_kind
    evaluation["evaluation_warning"] = evaluation_warning
    evaluation["session_independent"] = evaluation_kind == "session_grouped_held_out"
    evaluation["validation_accuracy_for_model_selection"] = validation_accuracy
    evaluation["training_sample_count"] = int(len(development_indices))
    evaluation["selected_training_epochs"] = best_epoch

    args.model.parent.mkdir(parents=True, exist_ok=True)
    checkpoint = {
        "format_version": MODEL_FORMAT_VERSION,
        "model_config": DEFAULT_MODEL_CONFIG,
        "state_dict": model.state_dict(),
    }
    temporary_model = args.model.with_suffix(args.model.suffix + ".tmp")
    torch.save(checkpoint, temporary_model)
    temporary_model.replace(args.model)
    save_json(
        args.labels,
        {
            "labels": list(GESTURE_LABELS),
            "label_to_index": label_to_index,
        },
    )
    save_json(args.preprocessing, PREPROCESSING_CONFIG)
    save_json(
        args.evaluation,
        {
            **evaluation,
            "dataset": str(args.dataset.resolve()),
            "dataset_sessions": sorted(set(data.sessions.tolist())),
            "evaluation_kind": evaluation_kind,
            "evaluation_warning": evaluation_warning,
            "session_independent": evaluation_kind == "session_grouped_held_out",
            "split_counts": {
                "train": int(len(splits.train)),
                "validation": int(len(splits.validation)),
                "test": int(len(splits.test)),
            },
            "seed": args.seed,
        },
    )
    return evaluation


def main() -> int:
    args = parse_args()
    try:
        evaluation = run_training(args)
    except (DatasetValidationError, InsufficientSessionsError, FileExistsError, ValueError) as error:
        print(f"Training stopped: {error}", file=sys.stderr)
        return 2
    print(json.dumps(evaluation, indent=2))
    print(f"Model saved to {args.model}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
