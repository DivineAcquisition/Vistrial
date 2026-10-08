import { FieldRow } from "@/components/config/field-row";
import { Panel } from "@/components/ui/panel";
import { fieldsBySection } from "@/lib/config/format";
import type { LayerInfo } from "@/lib/config/screens";
import type { ConfigLevel, EffectiveConfig } from "@/lib/config/types";
import { bodyText, sectionTitle } from "@/lib/ui";

/**
 * The eleven sections, each field with its value, where it came from, and
 * (for people who may) an editor. The same layout serves a workspace, a
 * template, and the platform default.
 */
export function ConfigSections({
  level,
  layer,
  effective,
  canEdit,
  canLock,
}: {
  level: ConfigLevel;
  layer: LayerInfo;
  effective: EffectiveConfig;
  canEdit: boolean;
  canLock: boolean;
}) {
  const sections = fieldsBySection()
    .map((section) => ({
      ...section,
      fields: section.fields.filter((field) => level === "workspace" || !field.workspaceOnly),
    }))
    .filter((section) => section.fields.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Sections" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {sections.map((section) => {
          const issues = effective.issues.filter((issue) => section.fields.some((field) => field.key === issue.key)).length;
          return (
            <a key={section.section} href={`#section-${section.section}`} className="text-muted-foreground hover:text-white">
              {section.label}
              {issues ? <span className="text-flag-critical"> ({issues})</span> : null}
            </a>
          );
        })}
      </nav>
      {sections.map((section) => (
        <div key={section.section} id={`section-${section.section}`} className="scroll-mt-24">
          <Panel className="p-5 sm:p-6">
            <h2 className={sectionTitle}>{section.label}</h2>
            <p className={bodyText}>{section.description}</p>
            <div className="mt-2">
              {section.fields.map((field) => {
                const resolved = effective.fields[field.key];
                const lockedAbove = level === "workspace" && resolved.lockedAt !== null;
                return (
                  <FieldRow
                    key={field.key}
                    fieldKey={field.key}
                    level={level}
                    layerId={layer.id}
                    layerVersion={layer.version}
                    ownValue={layer.values[field.key]}
                    resolved={resolved}
                    lockedHere={layer.lockedKeys.includes(field.key)}
                    canLock={canLock}
                    canEdit={canEdit && (!lockedAbove || Boolean(field.tighten))}
                    problems={effective.issues.filter((issue) => issue.key === field.key).map((issue) => issue.message)}
                  />
                );
              })}
            </div>
          </Panel>
        </div>
      ))}
    </div>
  );
}
