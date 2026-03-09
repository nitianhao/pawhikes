import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/site/Header";

const mainStyle: React.CSSProperties = {
  flex: 1,
  width: "100%",
  maxWidth: "72rem",
  margin: "0 auto",
  padding: "2rem 1rem",
  minHeight: "60vh",
};

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main style={mainStyle}>{children}</main>
      <Footer />
    </>
  );
}
