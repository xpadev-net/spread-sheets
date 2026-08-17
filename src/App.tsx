import { useEffect, useState } from "react";
import { Demo } from "./Demo.tsx";
import { Docs } from "./Docs.tsx";

type View = "demo" | "docs";

function viewFromHash(): View {
  return window.location.hash === "#docs" ? "docs" : "demo";
}

export function App() {
  const [view, setView] = useState<View>(viewFromHash);

  useEffect(() => {
    const onHashChange = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function go(next: View) {
    window.location.hash = next === "docs" ? "#docs" : "";
    setView(next);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", boxSizing: "border-box" }}>
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "10px 16px",
          borderBottom: "1px solid #dadce0",
          flexShrink: 0,
        }}
      >
        <strong style={{ fontSize: 14 }}>@xpadev-net/spread-sheets</strong>
        <button
          type="button"
          onClick={() => go("demo")}
          style={{ fontWeight: view === "demo" ? 700 : 400, cursor: "pointer" }}
        >
          Demo
        </button>
        <button
          type="button"
          onClick={() => go("docs")}
          style={{ fontWeight: view === "docs" ? 700 : 400, cursor: "pointer" }}
        >
          Docs
        </button>
        <a
          href="https://github.com/xpadev-net/spread-sheets"
          target="_blank"
          rel="noreferrer"
          style={{ marginLeft: "auto", fontSize: 13 }}
        >
          GitHub
        </a>
      </nav>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: view === "demo" ? 16 : 0 }}>
        {view === "demo" ? <Demo /> : <Docs />}
      </div>
    </div>
  );
}
