import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminDashboard } from "./AdminDashboard";

const route = (id: string, merchantId: string) => ({
  id,
  merchantId,
  shipperName: `Shipper ${id}`,
  status: "IN_PROGRESS" as const,
  estimatedMinutes: 8,
  remainingEstimatedMinutes: 3.2,
  currentStopId: `stop-${id}`,
  stops: [
    {
      id: `stop-${id}`,
      buildingId: "building_c3",
      sequence: 1,
      status: "NEXT" as const,
      orderIds: [],
    },
  ],
  routeExplanation: [],
  gps: { x: 20, y: 30, updatedAt: "2026-07-19T00:00:00.000Z" },
});

const reviewMerchant = vi.fn();
vi.mock("../state/AppContext", () => ({
  useApp: () => ({
    data: {
      buildings: [
        {
          id: "building_c3",
          name: "Dormitory C3",
          pickupLabel: "C3 main gate",
          x: 20,
          y: 30,
        },
      ],
      merchants: [
        {
          id: "merchant_green_bowl",
          name: "Green Bowl",
          description: "Approved",
          prepMinutes: 18,
          active: true,
          status: "APPROVED",
        },
        {
          id: "merchant_river_kitchen",
          name: "River Kitchen",
          description: "Waiting",
          prepMinutes: 18,
          active: false,
          status: "PENDING",
        },
      ],
      trips: [
        route("trip-one", "merchant_green_bowl"),
        route("trip-two", "merchant_river_kitchen"),
      ],
      trip: route("trip-one", "merchant_green_bowl"),
      products: [],
      orders: [],
      applications: [],
    },
    actions: {},
    reviewMerchant,
  }),
}));

describe("admin dashboard", () => {
  it("offers every active route, keeps the map before route facts, and labels merchant actions", () => {
    const { container } = render(<AdminDashboard />);
    expect(
      screen.getByRole("combobox", { name: "Choose active delivery route" }),
    ).toHaveTextContent("Green Bowl");
    expect(
      screen.getByRole("combobox", { name: "Choose active delivery route" }),
    ).toHaveTextContent("River Kitchen");
    expect(
      screen.getByRole("button", { name: "Approve River Kitchen" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reject River Kitchen" }),
    ).toBeInTheDocument();
    const map = screen.getByLabelText("KTX Khu B delivery route map");
    const currentStop = screen.getByText("Current stop");
    expect(screen.getByText("Remaining ETA")).toBeInTheDocument();
    expect(screen.getByText("4 min")).toBeInTheDocument();
    expect(
      map.compareDocumentPosition(currentStop) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container).toBeTruthy();
  });
});
