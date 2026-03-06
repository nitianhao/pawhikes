import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DogPolicyBanner } from "../DogPolicyBanner";

describe("DogPolicyBanner", () => {
  it("renders section with heading Dog Policy", () => {
    const html = renderToStaticMarkup(
      <DogPolicyBanner
        dogsAllowed={null}
        leashPolicy={null}
        leashDetails={null}
        policySourceUrl={null}
      />
    );
    expect(html).toContain("Dog Policy");
  });

  it("renders certified badge when dogsAllowed, leashPolicy, and policySourceUrl are set", () => {
    const html = renderToStaticMarkup(
      <DogPolicyBanner
        dogsAllowed="yes"
        leashPolicy="on-leash required"
        leashDetails="Leash required on corridor."
        policySourceUrl="https://austintexas.gov/page"
        policySourceTitle="AustinTexas.gov"
      />
    );
    expect(html).toContain("Dog Policy");
    expect(html).toContain("Certified dog policy");
    expect(html).toContain("Allowed");
    expect(html).toContain("Required");
    expect(html).toContain("Leash required on corridor");
  });

  it("renders Dog policy available when policySourceUrl is missing", () => {
    const html = renderToStaticMarkup(
      <DogPolicyBanner
        dogsAllowed="yes"
        leashPolicy="required"
        leashDetails={null}
        policySourceUrl={null}
      />
    );
    expect(html).toContain("Dog policy available");
    expect(html).toContain("Dogs");
    expect(html).toContain("Leash");
    expect(html).toContain("Off-leash");
  });

  it("renders three policy chips (Dogs, Leash, Off-leash)", () => {
    const html = renderToStaticMarkup(
      <DogPolicyBanner
        dogsAllowed="conditional"
        leashPolicy="off-leash in designated area"
        leashDetails={null}
        policySourceUrl={null}
      />
    );
    expect(html).toContain("Dogs");
    expect(html).toContain("Leash");
    expect(html).toContain("Off-leash");
    expect(html).toContain("Conditional");
    expect(html).toContain("Designated areas only");
  });

  it("derives off-leash = Designated areas only when conditional + DOLA details", () => {
    const html = renderToStaticMarkup(
      <DogPolicyBanner
        dogsAllowed="allowed"
        leashPolicy="conditional"
        leashDetails="Off-leash permitted only within the designated DOLA inside Walnut Creek Metropolitan Park."
        policySourceUrl="https://austintexas.gov/dola"
      />
    );
    expect(html).toContain("Designated areas only");
    expect(html).toContain("Certified dog policy");
  });

  it("renders full policy paragraph when leashDetails provided", () => {
    const longText = "Dogs must be on leash at all times on the main corridor. Off-leash only in the designated DOLA north of the creek.";
    const html = renderToStaticMarkup(
      <DogPolicyBanner
        dogsAllowed="yes"
        leashPolicy="required"
        leashDetails={longText}
        policySourceUrl={null}
      />
    );
    expect(html).toContain(longText);
  });
});
