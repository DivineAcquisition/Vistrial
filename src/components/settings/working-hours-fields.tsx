import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function WorkingHoursFields({
  start = "",
  end = "",
  required = false,
  help,
}: {
  start?: string;
  end?: string;
  required?: boolean;
  help?: string;
}) {
  return (
    <FieldGroup legend="Working hours" help={help} columns={2}>
      <Field label="Start" name="working_hours_start">
        <Input
          name="working_hours_start"
          id="working_hours_start"
          type="time"
          required={required}
          defaultValue={start}
        />
      </Field>
      <Field label="End" name="working_hours_end">
        <Input
          name="working_hours_end"
          id="working_hours_end"
          type="time"
          required={required}
          defaultValue={end}
        />
      </Field>
    </FieldGroup>
  );
}
