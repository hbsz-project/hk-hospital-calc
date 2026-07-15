import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";

describe("professional estimate inputs", () => {
  beforeEach(() => localStorage.clear());

  it("shows the current system estimate in all four quote fields", () => {
    render(<App />);
    const placeholders = screen.getAllByPlaceholderText(/系統估算/).map((element) =>
      element.getAttribute("placeholder")
    );
    expect(placeholders).toEqual(expect.arrayContaining([
      "30,000（系統估算）",
      "10,000（系統估算）",
      "1,000（系統估算）",
      "2,000（系統估算）"
    ]));
  });
});
