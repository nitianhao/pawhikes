import Link from "next/link";

const currentYear = new Date().getFullYear();

const footerStyle: React.CSSProperties = {
  borderTop: "1px solid #e2e8f0",
  marginTop: "3rem",
  paddingTop: "2rem",
  paddingBottom: "2rem",
  backgroundColor: "#fafafa",
};

const containerStyle: React.CSSProperties = {
  maxWidth: "72rem",
  margin: "0 auto",
  padding: "0 1rem",
};

const topRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  marginBottom: "0.75rem",
};

const copyrightStyle: React.CSSProperties = {
  fontSize: "0.875rem",
  color: "#64748b",
};

const linksStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "1rem",
};

const linkStyle: React.CSSProperties = {
  fontSize: "0.875rem",
  color: "#475569",
  textDecoration: "none",
};

const disclaimerStyle: React.CSSProperties = {
  fontSize: "0.8125rem",
  color: "#94a3b8",
  lineHeight: 1.5,
  maxWidth: "56rem",
};

export function Footer() {
  return (
    <footer style={footerStyle}>
      <div style={containerStyle}>
        <div style={topRowStyle}>
          <span style={copyrightStyle}>© {currentYear} Paw Hikes</span>
          <div style={linksStyle}>
            <Link href="/" style={linkStyle}>
              Home
            </Link>
            <Link href="/#coverage" style={linkStyle}>
              Coverage
            </Link>
          </div>
        </div>
        <p style={disclaimerStyle}>
          Structured trail data is maintained on a best-effort basis. Confirm local dog rules, access policies, and live conditions before each hike.
        </p>
      </div>
    </footer>
  );
}
