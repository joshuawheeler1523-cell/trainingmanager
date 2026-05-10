import { headers } from "next/headers";
import { getBrandForAgency } from "@/lib/brand";
import LoginForm, { type LoginBrand } from "./login-form";

/**
 * Server wrapper for the login page. Reads x-agency-id from the proxy
 * (Phase 3) — when set, the request landed on a verified agency custom
 * domain and we render the login form with that agency's brand. Otherwise
 * the default Arbor login is shown.
 */
export default async function LoginPage() {
  const h = await headers();
  const agencyId = h.get("x-agency-id");

  let brand: LoginBrand;
  if (agencyId) {
    const b = await getBrandForAgency(agencyId);
    brand = {
      name: b.name,
      logoUrl: b.logoUrl,
      primaryColor: b.primaryColor,
      isAgency: true,
    };
  } else {
    brand = {
      name: "Arbor",
      logoUrl: null,
      primaryColor: "#2563eb",
      isAgency: false,
    };
  }

  return <LoginForm brand={brand} />;
}
