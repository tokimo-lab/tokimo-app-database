/**
 * Entry point for the Database sidecar app.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  type AppRuntimeCtx,
  type Dispose,
  RuntimeProvider,
  defineApp,
} from "@tokimo/sdk";
import {
  ConfigProvider,
  ToastProvider,
  enUS as uiEnUS,
  zhCN as uiZhCN,
} from "@tokimo/ui";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import DatabaseApp from "./DatabaseApp";
import "./index.css";

function App({ ctx, qc }: { ctx: AppRuntimeCtx; qc: QueryClient }) {
  const locale = ctx.locale.startsWith("zh") ? uiZhCN : uiEnUS;
  return (
    <StrictMode>
      <QueryClientProvider client={qc}>
        <ConfigProvider locale={locale}>
          <ToastProvider>
            <RuntimeProvider value={ctx}>
              <DatabaseApp ctx={ctx} />
            </RuntimeProvider>
          </ToastProvider>
        </ConfigProvider>
      </QueryClientProvider>
    </StrictMode>
  );
}

export default defineApp({
  id: "database",
  manifest: {
    id: "database",
    appName: "Database",
    icon: "Database",
    color: "#6366f1",
    windowType: "database",
    defaultSize: { width: 1200, height: 760 },
    category: "system",
  },
  mount(container, ctx): Dispose {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: 1, staleTime: 10_000 },
      },
    });
    const root: Root = createRoot(container);
    root.render(<App ctx={ctx} qc={qc} />);
    return () => root.unmount();
  },
});
