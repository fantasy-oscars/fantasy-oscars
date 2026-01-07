declare module "@fantasy-oscars/shared" {
  export type DraftState =
    import("../../../packages/shared/dist/draftState.js").DraftState;
  export {
    DraftStateError,
    enforceDraftTransition,
    getAllowedTransitionsFrom
  } from "../../../packages/shared/dist/draftState.js";
  export { getSnakeSeatForPick } from "../../../packages/shared/dist/draftOrder.js";
}
