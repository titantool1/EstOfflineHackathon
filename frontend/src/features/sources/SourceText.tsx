import { parseSourceText } from "./source-reference";
import { SourceLink } from "./SourceLink";

export function SourceText({ text }: { text: string }) {
  return <>{parseSourceText(text).map((segment, index) => segment.kind === "text"
    ? <span key={index}>{segment.text}</span>
    : <SourceLink key={`${segment.href}-${index}`} source={{ url: segment.href, title: segment.label }} label={segment.label} />)}</>;
}
