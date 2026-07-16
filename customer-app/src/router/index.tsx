import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";
import { Preloader } from "../components/Preloader";

const CampaignPage = lazy(() => import("../pages/CampaignPage"));
const NotFound = lazy(() => import("../pages/NotFound"));

function withSuspense(node: React.ReactNode) {
  return <Suspense fallback={<Preloader />}>{node}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: "/c/:merchant/:campaign",
    element: withSuspense(<CampaignPage />),
  },
  {
    path: "*",
    element: withSuspense(<NotFound />),
  },
]);
