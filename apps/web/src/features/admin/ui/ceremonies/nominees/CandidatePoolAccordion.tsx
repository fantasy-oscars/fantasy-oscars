import { Accordion, Button, FileInput, Group, Stack, Text } from "@ui";
import type { ApiResult } from "@/lib/types";
import { FormStatus } from "@/shared/forms";

export function CandidatePoolAccordion(props: {
  open: string | null;
  setOpen: (next: string | null) => void;
  candidateLoaded: boolean;
  candidateUploading: boolean;
  candidateUploadState: ApiResult | null;
  onPickFile: (file: File | null) => void;
  onUpload: () => void;
  onReset: () => void;
}) {
  const giconCheck = String.fromCharCode(0xe5ca);

  return (
    <Accordion
      value={props.open}
      onChange={props.setOpen}
      className="wizard-accordion"
      variant="contained"
    >
      <Accordion.Item
        value="candidate-pool"
        className="wizard-accordion-item is-optional"
      >
        <Accordion.Control>
          <Group justify="space-between" wrap="nowrap" w="100%">
            <Text fw="var(--fo-font-weight-bold)">Candidate pool (optional)</Text>
            {props.candidateLoaded ? (
              <Text
                component="span"
                className="gicon wizard-inline-check"
                aria-hidden="true"
              >
                {giconCheck}
              </Text>
            ) : null}
          </Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack className="stack-sm" gap="sm">
            <FileInput
              label="Candidate pool JSON"
              accept="application/json"
              onChange={props.onPickFile}
              fileInputProps={{ name: "candidate-pool-file" }}
              disabled={props.candidateUploading}
              placeholder="Choose file…"
            />

            <Group className="inline-actions" wrap="wrap">
              <Button
                type="button"
                onClick={props.onUpload}
                disabled={props.candidateUploading}
              >
                {props.candidateUploading ? "Loading..." : "Load candidate pool"}
              </Button>
              <Button
                type="button"
                variant="subtle"
                onClick={props.onReset}
                disabled={props.candidateUploading}
              >
                Reset
              </Button>
            </Group>

            {props.candidateUploadState?.ok === false ? (
              <FormStatus
                loading={props.candidateUploading}
                result={props.candidateUploadState}
              />
            ) : null}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
