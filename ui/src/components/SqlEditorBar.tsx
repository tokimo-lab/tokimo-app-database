/**
 * SqlEditorBar — lightweight SQL editor with hand-written syntax highlighting.
 *
 * Overlay approach: transparent `<textarea>` on top of a highlighted `<pre>`.
 * No Monaco — zero background-color issues, no ghost cursors.
 */

import { Button } from "@tokimo/ui";
import { Play } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

// ── SQL tokenizer ──

const SQL_KEYWORDS = new Set([
  "SELECT",
  "FROM",
  "WHERE",
  "INSERT",
  "UPDATE",
  "DELETE",
  "CREATE",
  "DROP",
  "ALTER",
  "JOIN",
  "LEFT",
  "RIGHT",
  "INNER",
  "OUTER",
  "CROSS",
  "FULL",
  "NATURAL",
  "ON",
  "AS",
  "AND",
  "OR",
  "NOT",
  "IN",
  "IS",
  "NULL",
  "LIKE",
  "ILIKE",
  "BETWEEN",
  "EXISTS",
  "HAVING",
  "GROUP",
  "BY",
  "ORDER",
  "LIMIT",
  "OFFSET",
  "SET",
  "INTO",
  "VALUES",
  "TABLE",
  "INDEX",
  "DISTINCT",
  "UNION",
  "ALL",
  "DESC",
  "ASC",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "TRUE",
  "FALSE",
  "WITH",
  "RETURNING",
  "PRIMARY",
  "KEY",
  "FOREIGN",
  "REFERENCES",
  "DEFAULT",
  "CHECK",
  "UNIQUE",
  "CONSTRAINT",
  "TRUNCATE",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
  "EXPLAIN",
  "ANALYZE",
  "GRANT",
  "REVOKE",
  "OVER",
  "PARTITION",
  "WINDOW",
  "RECURSIVE",
  "USING",
  "EXCEPT",
  "INTERSECT",
  "FETCH",
  "ROWS",
  "ONLY",
  "COALESCE",
  "CAST",
  "COUNT",
  "SUM",
  "AVG",
  "MIN",
  "MAX",
]);

type TokenKind = "kw" | "str" | "num" | "cmt" | "txt";

interface Token {
  k: TokenKind;
  v: string;
}

function tokenizeSql(sql: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const len = sql.length;

  while (i < len) {
    const ch = sql[i];

    // -- line comment
    if (ch === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      const j = end === -1 ? len : end;
      out.push({ k: "cmt", v: sql.slice(i, j) });
      i = j;
      continue;
    }

    // /* block comment */
    if (ch === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      const j = end === -1 ? len : end + 2;
      out.push({ k: "cmt", v: sql.slice(i, j) });
      i = j;
      continue;
    }

    // 'single-quoted string'
    if (ch === "'") {
      let j = i + 1;
      while (j < len) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") {
          j++;
          break;
        } else j++;
      }
      out.push({ k: "str", v: sql.slice(i, j) });
      i = j;
      continue;
    }

    // number
    if (
      (ch >= "0" && ch <= "9") ||
      (ch === "." && i + 1 < len && sql[i + 1] >= "0" && sql[i + 1] <= "9")
    ) {
      let j = i;
      while (j < len && ((sql[j] >= "0" && sql[j] <= "9") || sql[j] === "."))
        j++;
      out.push({ k: "num", v: sql.slice(i, j) });
      i = j;
      continue;
    }

    // word (keyword or identifier)
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
      let j = i + 1;
      while (
        j < len &&
        ((sql[j] >= "a" && sql[j] <= "z") ||
          (sql[j] >= "A" && sql[j] <= "Z") ||
          (sql[j] >= "0" && sql[j] <= "9") ||
          sql[j] === "_")
      )
        j++;
      const word = sql.slice(i, j);
      out.push({
        k: SQL_KEYWORDS.has(word.toUpperCase()) ? "kw" : "txt",
        v: word,
      });
      i = j;
      continue;
    }

    // whitespace run
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      let j = i + 1;
      while (
        j < len &&
        (sql[j] === " " ||
          sql[j] === "\t" ||
          sql[j] === "\n" ||
          sql[j] === "\r")
      )
        j++;
      out.push({ k: "txt", v: sql.slice(i, j) });
      i = j;
      continue;
    }

    // anything else (operators, punctuation, etc.)
    out.push({ k: "txt", v: ch });
    i++;
  }

  return out;
}

const TOKEN_CLASS: Record<TokenKind, string> = {
  kw: "text-blue-600 dark:text-blue-400 font-medium",
  str: "text-emerald-600 dark:text-emerald-400",
  num: "text-amber-600 dark:text-amber-300",
  cmt: "text-fg-muted italic",
  txt: "",
};

// ── Component ──

export interface SqlEditorBarHandle {
  setText: (sql: string) => void;
}

interface SqlEditorBarProps {
  initialValue: string;
  onExecute: (sql: string) => void;
  isPending: boolean;
}

const SHARED =
  "text-xs font-mono leading-[1.5] p-2 whitespace-pre-wrap break-words";

const SqlEditorBar = forwardRef<SqlEditorBarHandle, SqlEditorBarProps>(
  function SqlEditorBar({ initialValue, onExecute, isPending }, ref) {
    const [text, setText] = useState(initialValue);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const preRef = useRef<HTMLPreElement>(null);

    useImperativeHandle(ref, () => ({
      setText(sql: string) {
        setText(sql);
        requestAnimationFrame(() => {
          const ta = textareaRef.current;
          if (ta) {
            ta.focus();
            ta.setSelectionRange(sql.length, sql.length);
          }
        });
      },
    }));

    const tokens = useMemo(() => tokenizeSql(text), [text]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          const sql = text.trim();
          if (sql) onExecute(sql);
        }
      },
      [text, onExecute],
    );

    const handleExecuteClick = useCallback(() => {
      const sql = text.trim();
      if (sql) onExecute(sql);
    }, [text, onExecute]);

    const syncScroll = useCallback(() => {
      if (textareaRef.current && preRef.current) {
        preRef.current.scrollTop = textareaRef.current.scrollTop;
        preRef.current.scrollLeft = textareaRef.current.scrollLeft;
      }
    }, []);

    return (
      <div className="border-b border-border-base flex gap-2 items-end p-2">
        <div className="flex-1 rounded-md border border-border-base overflow-hidden relative h-[60px]">
          {/* Highlighted layer */}
          <pre
            ref={preRef}
            className={`absolute inset-0 m-0 overflow-hidden pointer-events-none ${SHARED}`}
            aria-hidden
          >
            {tokens.map((t, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: tokens fully recomputed each render
              <span key={i} className={TOKEN_CLASS[t.k]}>
                {t.v}
              </span>
            ))}
            {"\n"}
          </pre>

          {/* Placeholder */}
          {text === "" && (
            <div
              className={`absolute inset-0 pointer-events-none text-fg-muted ${SHARED}`}
            >
              输入 SQL 查询…
            </div>
          )}

          {/* Editable layer (transparent text, visible caret) */}
          <textarea
            ref={textareaRef}
            className={`relative z-10 w-full h-full bg-transparent text-transparent caret-black dark:caret-white outline-none resize-none ${SHARED}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={syncScroll}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
        </div>
        <Button
          variant="primary"
          size="small"
          onClick={handleExecuteClick}
          loading={isPending}
        >
          <Play className="h-3.5 w-3.5 mr-1" />
          执行
        </Button>
      </div>
    );
  },
);

export default SqlEditorBar;
