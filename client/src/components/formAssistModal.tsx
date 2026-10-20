import { FormInstance } from "antd";
import { ReactNode } from "react";
import { AssistResult, runAssist } from "../utils/assist";
import { AssistModal, AssistRow } from "./assistModal";

export interface AssistFieldSpec {
  // Field name in the assist result
  key: string;
  label: string;
  // Form field the suggestion goes into; defaults to key
  formField?: string;
  // The current value in the same terms as the suggestion (e.g. a category name rather than its ID);
  // defaults to the form field's value
  current?: (formValues: Record<string, unknown>) => unknown;
  // How to show the suggestion in the review table; defaults to the value as text
  display?: (value: unknown) => string;
  // Convert a suggestion into a form value, e.g. look up or create a referenced item; defaults to the value itself
  toFormValue?: (value: unknown) => unknown | Promise<unknown>;
  // Leave the row unchecked by default when the form already has a value (for free-text fields like comments)
  onlyIfEmpty?: boolean;
}

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === "";
}

function sameValue(a: unknown, b: unknown) {
  if (typeof b === "number") {
    return !isEmpty(a) && Number(a) === b;
  }
  return a === b;
}

/**
 * Assist modal for simple forms, where each suggested field maps straight onto one form field.
 */
export function FormAssistModal(props: {
  open: boolean;
  onClose: () => void;
  task: string;
  title: string;
  placeholder: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: FormInstance<any>;
  fields: AssistFieldSpec[];
  defaultQuery: (formValues: Record<string, unknown>) => string;
  context?: Record<string, unknown>;
  onFilled: (formFields: string[]) => void;
}) {
  const { form, fields } = props;
  const formField = (spec: AssistFieldSpec) => spec.formField ?? spec.key;

  const currentValues = () => {
    const values = form.getFieldsValue(true) as Record<string, unknown>;
    return Object.fromEntries(fields.map((spec) => [spec.key, spec.current ? spec.current(values) : values[formField(spec)]]));
  };

  const lookup = (query: string, signal: AbortSignal) =>
    runAssist<Record<string, unknown>>(props.task, { query, current: currentValues(), context: props.context ?? {} }, signal);

  const buildRows = (result: AssistResult<Record<string, unknown>>): AssistRow[] => {
    const current = currentValues();
    return fields
      .filter((spec) => !isEmpty(result.fields[spec.key]))
      .map((spec) => {
        const value = result.fields[spec.key];
        const cur = current[spec.key];
        return {
          key: spec.key,
          label: spec.label,
          current: isEmpty(cur) ? undefined : (String(cur) as ReactNode),
          suggested: spec.display ? spec.display(value) : String(value),
          defaultChecked: !sameValue(cur, value) && !(spec.onlyIfEmpty && !isEmpty(cur)),
        };
      });
  };

  const onApply = async (result: AssistResult<Record<string, unknown>>, keys: string[]) => {
    const filled: string[] = [];
    for (const spec of fields) {
      if (!keys.includes(spec.key)) continue;
      const value = result.fields[spec.key];
      form.setFieldValue(formField(spec), spec.toFormValue ? await spec.toFormValue(value) : value);
      filled.push(formField(spec));
    }
    props.onFilled(filled);
  };

  return (
    <AssistModal
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      placeholder={props.placeholder}
      defaultQuery={props.open ? props.defaultQuery(form.getFieldsValue(true)) : ""}
      lookup={lookup}
      buildRows={buildRows}
      onApply={onApply}
    />
  );
}
