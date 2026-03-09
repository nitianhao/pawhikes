import type { Metadata } from "next";
import { DogTypeLandingPage, generateDogTypeMetadata } from "../_dogTypePage";

export const revalidate = 1800;

export async function generateMetadata(args: {
  params: Promise<{ state: string; city: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  return generateDogTypeMetadata({
    params: args.params,
    searchParams: args.searchParams,
    routeSlug: "trails-for-senior-dogs",
  });
}

export default function Page(args: { params: Promise<{ state: string; city: string }> }) {
  return DogTypeLandingPage({
    params: args.params,
    routeSlug: "trails-for-senior-dogs",
  });
}
