/** Lets long CamelCase / snake_case / dotted names wrap at word boundaries. */
export function breakable(name: string) {
  return name.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[_./-])/).map((part, i) => (
    <span key={i}>
      {i > 0 && <wbr />}
      {part}
    </span>
  ));
}
