import Link from "next/link";

const headerStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 10,
  backgroundColor: "#15803d",
  borderBottom: "2px solid #4ade80",
};

const containerStyle: React.CSSProperties = {
  maxWidth: "72rem",
  margin: "0 auto",
  padding: "0 1rem",
  height: "3.5rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
};

const logoStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: "1.25rem",
  color: "#fff",
  textDecoration: "none",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  letterSpacing: "-0.01em",
};

const navStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "1.25rem",
};

const navLinkStyle: React.CSSProperties = {
  fontSize: "0.875rem",
  color: "#dcfce7",
  textDecoration: "none",
  fontWeight: 500,
};

/** Inline paw-print SVG — no external asset needed */
function PawIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ color: "#4ade80", flexShrink: 0 }}
    >
      {/* Toe beans */}
      <ellipse cx="6.5" cy="3.5" rx="1.5" ry="2" />
      <ellipse cx="11" cy="2.5" rx="1.5" ry="2" />
      <ellipse cx="15.5" cy="3.5" rx="1.5" ry="2" />
      <ellipse cx="19" cy="7" rx="1.5" ry="2" />
      {/* Main pad */}
      <path d="M12 8c-3.5 0-7 2.5-7 6.5 0 2.5 1.5 5 4 5.5.8.2 2 .5 3 .5s2.2-.3 3-.5c2.5-.5 4-3 4-5.5C19 10.5 15.5 8 12 8z" />
    </svg>
  );
}

export function Header() {
  return (
    <header style={headerStyle}>
      <div style={containerStyle}>
        <Link href="/" style={logoStyle}>
          <PawIcon />
          Paw Hikes
        </Link>
        <nav style={navStyle} aria-label="Main">
          <Link href="/" style={navLinkStyle}>
            Browse
          </Link>
          <Link href="/tx/austin" style={navLinkStyle}>
            Austin
          </Link>
          <Link href="/" style={navLinkStyle}>
            Home
          </Link>
        </nav>
      </div>
    </header>
  );
}
