/** Editing helpers deliberately preserve HA's scalar/list and string/number forms. */
export const flowRecord = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const flowTemplate = (value: unknown): value is string =>
  typeof value === "string" && /\{[{%#]/.test(value);

export function updateFlowValue(
  row: any,
  path: (string | number)[],
  value: unknown,
  remove = false,
): any {
  if (!path.length) return value;
  const [key, ...rest] = path;
  if (["__proto__", "prototype", "constructor"].includes(String(key)))
    throw new Error("Invalid field");
  if (row != null && !flowRecord(row) && !Array.isArray(row))
    throw new Error("Cannot edit a field inside an expression");
  const copy = Array.isArray(row) ? [...row] : { ...row };
  if (rest.length)
    copy[key as any] = updateFlowValue(copy[key as any], rest, value, remove);
  else if (remove) {
    if (Array.isArray(copy)) copy.splice(Number(key), 1);
    else delete copy[key];
  } else copy[key as any] = value;
  return copy;
}

export function parseFlowNumber(
  original: unknown,
  text: string,
  options: { minimum?: number; maximum?: number; integer?: boolean } = {},
): { valid: boolean; value?: number | string } {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text.trim()))
    return { valid: false };
  const n = Number(text);
  if (
    !Number.isFinite(n) ||
    (options.integer && !Number.isInteger(n)) ||
    (options.minimum !== undefined && n < options.minimum) ||
    (options.maximum !== undefined && n > options.maximum)
  )
    return { valid: false };
  return { valid: true, value: typeof original === "string" ? text : n };
}

export function flowFieldDraft(
  original: unknown,
  text: string,
  options: {
    number?: boolean;
    required?: boolean;
    minimum?: number;
    maximum?: number;
    integer?: boolean;
    validate?: (value: string) => boolean;
  } = {},
): { valid: boolean; value?: string | number } {
  if (options.number && !flowTemplate(original))
    return parseFlowNumber(original, text, options);
  if (typeof original === "number")
    return parseFlowNumber(original, text, options);
  return {
    valid:
      (!options.required || text.trim().length > 0) &&
      (!options.validate || options.validate(text)),
    value: text,
  };
}

export function flowSelectionValid(value: unknown, required: boolean): boolean {
  if (value === undefined) return !required;
  if (flowTemplate(value)) return true;
  if (Array.isArray(value))
    return (
      (!required || value.length > 0) &&
      value.every((v) => typeof v !== "string" || v.trim().length > 0)
    );
  if (typeof value === "string") return value.trim().length > 0;
  return true; // Nonstandard source values are retained for the configuration editor.
}

export function replaceFlowSelection(
  value: unknown,
  index: number,
  next: string,
): string | string[] {
  if (Array.isArray(value)) {
    const result = [...value];
    result[index] = next;
    return result;
  }
  return next;
}

export function changeConditionOperator(
  row: Record<string, any>,
  operator: "and" | "or" | "not",
) {
  if (["and", "or", "not"].includes(row.condition))
    return { ...row, condition: operator };
  const keys = ["and", "or", "not"].filter((key) => Object.hasOwn(row, key));
  if (keys.length !== 1) return row;
  const { [keys[0]]: children, ...rest } = row;
  return { ...rest, [operator]: children };
}

export function serviceTargetPath(row: Record<string, any>): string[] {
  if (flowRecord(row.target) && Object.hasOwn(row.target, "entity_id"))
    return ["target", "entity_id"];
  if (Object.hasOwn(row, "entity_id")) return ["entity_id"];
  if (flowRecord(row.data) && Object.hasOwn(row.data, "entity_id"))
    return ["data", "entity_id"];
  if (
    flowRecord(row.data_template) &&
    Object.hasOwn(row.data_template, "entity_id")
  )
    return ["data_template", "entity_id"];
  return ["target", "entity_id"];
}

export function flowClockValue(text: string): boolean {
  return (
    flowTemplate(text) ||
    /^(?:input_datetime|sensor)\.[a-z0-9_]+$/.test(text) ||
    /^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(text)
  );
}

export function flowDurationValue(text: string, signed = false): boolean {
  if (flowTemplate(text)) return true;
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text))
    return signed || Number(text) >= 0;
  return (
    signed
      ? /^[+-]?\d+:[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/
      : /^\d+:[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/
  ).test(text);
}

/** Constraints introduced by the friendly controls, without interpreting templates. */
export function flowInspectorProblem(
  row: unknown,
): "boundary" | "range" | "weekdays" | null {
  if (!flowRecord(row)) return null;
  const type = row.trigger || row.platform || row.condition;
  if (type === "numeric_state") {
    if (row.above === undefined && row.below === undefined) return "boundary";
    const literal = (v: unknown) =>
      typeof v === "number"
        ? v
        : typeof v === "string" && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v)
          ? Number(v)
          : undefined;
    const above = literal(row.above),
      below = literal(row.below);
    if (above !== undefined && below !== undefined && above >= below)
      return "range";
  }
  if (
    row.condition === "time" &&
    Array.isArray(row.weekday) &&
    row.weekday.length === 0
  )
    return "weekdays";
  return null;
}
