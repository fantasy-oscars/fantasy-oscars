export function extractProjectFields(projectItems) {
  const projects = [];

  for (const item of projectItems ?? []) {
    const project = item?.project;
    if (!project) continue;

    const fields = {};
    for (const fv of item.fieldValues?.nodes ?? []) {
      if (fv?.__typename === "ProjectV2ItemFieldSingleSelectValue" && fv.field?.name) {
        fields[fv.field.name] = fv.name ?? null;
      } else if (fv?.__typename === "ProjectV2ItemFieldIterationValue" && fv.field?.name) {
        fields[fv.field.name] = fv.title ?? null;
      } else if (fv?.__typename === "ProjectV2ItemFieldTextValue" && fv.field?.name) {
        fields[fv.field.name] = fv.text ?? null;
      } else if (fv?.__typename === "ProjectV2ItemFieldNumberValue" && fv.field?.name) {
        fields[fv.field.name] = fv.number ?? null;
      } else if (fv?.__typename === "ProjectV2ItemFieldDateValue" && fv.field?.name) {
        fields[fv.field.name] = fv.date ?? null;
      }
    }

    projects.push({
      title: project.title ?? null,
      number: project.number ?? null,
      fields
    });
  }

  return projects;
}

