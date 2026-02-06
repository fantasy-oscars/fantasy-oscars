import { createContext, useContext } from "react";

type CeremonyWizardContextValue = {
  reloadWorksheet: () => Promise<void>;
};

const CeremonyWizardContext = createContext<CeremonyWizardContextValue | null>(null);

export function useCeremonyWizardContext() {
  const ctx = useContext(CeremonyWizardContext);
  if (!ctx) return null;
  return ctx;
}

export function CeremonyWizardProvider(props: {
  value: CeremonyWizardContextValue;
  children: React.ReactNode;
}) {
  return (
    <CeremonyWizardContext.Provider value={props.value}>
      {props.children}
    </CeremonyWizardContext.Provider>
  );
}
