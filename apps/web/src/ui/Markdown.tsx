// Keep this wrapper for existing call sites, but ensure Markdown is rendered
// through the single, centralized MarkdownRenderer implementation.
export { MarkdownRenderer as Markdown } from "./MarkdownRenderer";
