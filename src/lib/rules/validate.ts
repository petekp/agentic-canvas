import Ajv, { type ErrorObject } from "ajv/dist/2020";
import ruleSchema from "./rules.schema.json";

type ValidationResult = {
  valid: boolean;
  errors?: string[];
};

const ajv = new Ajv({ allErrors: true, strict: false });

const validateRulePackFn = ajv.compile(ruleSchema as object);

const patchSchema = {
  $schema: (ruleSchema as { $schema?: string }).$schema ?? "https://json-schema.org/draft/2020-12/schema",
  $defs: (ruleSchema as { $defs?: unknown }).$defs,
  type: "object",
  required: ["target", "rules"],
  additionalProperties: false,
  properties: {
    target: { $ref: "#/$defs/RuleTarget" },
    rules: {
      type: "array",
      items: { $ref: "#/$defs/Rule" },
      minItems: 1,
    },
    summary: { type: "string" },
  },
};

const validatePatchFn = ajv.compile(patchSchema as object);

function formatErrors(errors?: ErrorObject[] | null): string[] | undefined {
  if (!errors || errors.length === 0) return undefined;
  return errors.map((error) => {
    const path = error.instancePath ? error.instancePath : "/";
    const message = error.message ?? "Invalid value";
    return `${path} ${message}`.trim();
  });
}

export function validateRulePack(value: unknown): ValidationResult {
  const valid = validateRulePackFn(value) as boolean;
  if (valid) return { valid: true };
  return { valid: false, errors: formatErrors(validateRulePackFn.errors) };
}

export function validatePreferencePatch(value: unknown): ValidationResult {
  const valid = validatePatchFn(value) as boolean;
  if (valid) return { valid: true };
  return { valid: false, errors: formatErrors(validatePatchFn.errors) };
}
