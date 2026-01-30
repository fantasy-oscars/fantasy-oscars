import ReactMarkdown from "react-markdown";

export function Markdown(props: { markdown: string }) {
  const { markdown } = props;
  return (
    <div className="prose">
      <ReactMarkdown>{markdown}</ReactMarkdown>
    </div>
  );
}
