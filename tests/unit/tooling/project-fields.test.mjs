import test from "node:test";
import assert from "node:assert/strict";

import { extractProjectFields } from "../../../.github/scripts/lib/project-fields.mjs";

test("extractProjectFields reads common project field value types", () => {
  const projects = extractProjectFields([
    {
      project: { title: "Roadmap", number: 1 },
      fieldValues: {
        nodes: [
          {
            __typename: "ProjectV2ItemFieldSingleSelectValue",
            name: "Todo",
            field: { name: "Status" }
          },
          {
            __typename: "ProjectV2ItemFieldIterationValue",
            title: "Foundations",
            field: { name: "Iteration" }
          },
          {
            __typename: "ProjectV2ItemFieldTextValue",
            text: "Foo",
            field: { name: "Notes" }
          },
          {
            __typename: "ProjectV2ItemFieldNumberValue",
            number: 3,
            field: { name: "Points" }
          },
          {
            __typename: "ProjectV2ItemFieldDateValue",
            date: "2026-01-01",
            field: { name: "Due" }
          }
        ]
      }
    }
  ]);

  assert.deepEqual(projects, [
    {
      title: "Roadmap",
      number: 1,
      fields: {
        Status: "Todo",
        Iteration: "Foundations",
        Notes: "Foo",
        Points: 3,
        Due: "2026-01-01"
      }
    }
  ]);
});
