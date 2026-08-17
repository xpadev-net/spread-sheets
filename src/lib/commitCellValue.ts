import type { DataModel } from "./DataModel.ts";
import type { ValidationStore } from "./ValidationStore.ts";
import type { CellAddress, CellChangeSource, CellValue } from "./types.ts";

export type CommitContext = {
  dataModel: DataModel;
  validationStore: ValidationStore;
  onChange?: (event: {
    address: CellAddress;
    oldValue: CellValue;
    newValue: CellValue;
    source: CellChangeSource;
  }) => void;
  onValidationError?: (event: {
    address: CellAddress;
    value: CellValue;
    rule: NonNullable<ReturnType<ValidationStore["getValidation"]>>;
    message: string;
    source: CellChangeSource;
  }) => void;
};

/**
 * The single mutation pipeline: every write, from any source (edit,
 * dropdown, fill, or the imperative API), goes through this function.
 * Returns false only when a 'reject'-mode rule blocked the write.
 */
export function commitCellValue(
  address: CellAddress,
  value: CellValue,
  source: CellChangeSource,
  ctx: CommitContext,
): boolean {
  const { dataModel, validationStore } = ctx;
  const oldValue = dataModel.getValue(address.row, address.col);
  const result = validationStore.evaluate(address, value);

  if (!result.ok) {
    const rule = validationStore.getValidation(address.row, address.col);
    if (rule) {
      ctx.onValidationError?.({
        address,
        value,
        rule,
        message: result.message ?? "Invalid value",
        source,
      });
    }
    if (result.mode === "reject") {
      return false;
    }
    dataModel.setValue(address.row, address.col, value);
    dataModel.setWarning(address.row, address.col, true, result.message ?? "Invalid value");
    ctx.onChange?.({ address, oldValue, newValue: value, source });
    return true;
  }

  dataModel.setValue(address.row, address.col, value);
  dataModel.setWarning(address.row, address.col, false);
  ctx.onChange?.({ address, oldValue, newValue: value, source });
  return true;
}
