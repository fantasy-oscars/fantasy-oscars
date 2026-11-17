/** DOM ids the settings modals give their fields, so focus can move to one. */
export const SETTINGS_PRIMARY_ID = "fs-settings-primary";

export function settingsFieldId(key: string): string {
  return `fs-setting-${key.replace(":", "-")}`;
}

export function settingsErrorId(key: string): string {
  return `${settingsFieldId(key)}-error`;
}

/** Below 500 px the settings modals fill the screen. */
export const SETTINGS_PHONE_QUERY = "(max-width: 499.98px)";
