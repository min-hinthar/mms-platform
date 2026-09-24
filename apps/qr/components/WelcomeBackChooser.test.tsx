/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * Phase 1c · account-star — a disclosure BEFORE a costly tap names every cost. A Welcome-back chip
 * signs in with the merge suppressed, so this phone's guest Stars and guest orders stay behind on
 * the abandoned anonymous uid. The note saying so must sit ABOVE the chips (read before the tap, not
 * after it) and must be static content, not a live region.
 */
const { WelcomeBackChooser } = await import("./WelcomeBackChooser");

const NOTE = {
  en: "Tapping a name signs in without this phone’s 3 guest Stars or the orders that earned them — use your email or Google below to bring your Stars and the orders that earned them along.",
  my: "နာမည်ကို နှိပ်ရင် ဒီဖုန်းက ကြယ်တွေနဲ့ အော်ဒါတွေ မပါလာပါဘူး — ကြယ်တွေ ယူလာချင်ရင် အောက်က အီးမေးလ် ဒါမှမဟုတ် Google နဲ့ ဝင်ပါ",
};

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(
    "mms.identities",
    JSON.stringify([
      { email: "min@example.com", firstName: "Min", tierId: "jade", method: "email", lastSeen: 1 },
    ]),
  );
});
afterEach(cleanup);

describe("the chooser note — said before the tap", () => {
  it("renders between the heading and the chips, as static content", async () => {
    // RED when the note is rendered after the <ul> (the diner reads the cost only after tapping).
    const { container } = render(
      <WelcomeBackChooser onSelect={() => {}} busy={false} note={NOTE} />,
    );
    await screen.findByRole("button", { name: /Sign back in as Min/ });
    const note = container.querySelector(".wb-note") as HTMLElement;
    const chip = container.querySelector(".wb-chip") as HTMLElement;
    expect(note).not.toBeNull();
    expect(note.textContent).toContain(NOTE.en);
    // The note PRECEDES the first chip in document order.
    expect(note.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // …and follows the heading.
    const heading = container.querySelector("#wb-heading") as HTMLElement;
    expect(heading.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Static: no live region anywhere in it.
    expect(note.getAttribute("role")).toBeNull();
    expect(note.hasAttribute("aria-live")).toBe(false);
    expect(note.querySelector('[role="status"], [role="alert"], [aria-live]')).toBeNull();
    expect(note.querySelector('[lang="my"]')?.textContent).toBe(NOTE.my);
  });

  it("is each chip's accessible DESCRIPTION, so Tab-and-listen hears the cost before the tap", async () => {
    // A screen reader tabbing into the list announces the chip's aria-label and skips a preceding
    // static <p>; document order alone never reaches it. RED without aria-describedby on the chip.
    render(<WelcomeBackChooser onSelect={() => {}} busy={false} note={NOTE} />);
    const chip = await screen.findByRole("button", { name: /Sign back in as Min/ });
    const ids = (chip.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
    expect(ids.length).toBe(1);
    const described = document.getElementById(ids[0] as string);
    expect(described?.classList.contains("wb-note")).toBe(true);
    expect(described?.textContent).toContain(NOTE.en);
  });

  it("describes nothing when there is no note", async () => {
    render(<WelcomeBackChooser onSelect={() => {}} busy={false} note={null} />);
    const chip = await screen.findByRole("button", { name: /Sign back in as Min/ });
    expect(chip.hasAttribute("aria-describedby")).toBe(false);
  });

  it("renders no note when nothing is at stake", async () => {
    const { container } = render(
      <WelcomeBackChooser onSelect={() => {}} busy={false} note={null} />,
    );
    await screen.findByRole("button", { name: /Sign back in as Min/ });
    expect(container.querySelector(".wb-note")).toBeNull();
  });
});
