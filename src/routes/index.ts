import { Router } from 'express';

import type { AuthRoutesDeps } from './auth.routes';
import { authRoutes } from './auth.routes';
import { healthRoutes } from './health.routes';
import type { HealthRoutesDeps } from './health.routes';
import { socialRoutes } from './social.routes';
import type { SocialRoutesDeps } from './social.routes';
import { notificationsRoutes } from './notifications.routes';
import type { NotificationsRoutesDeps } from './notifications.routes';
import { petRoutes } from './pets.routes';
import type { PetRoutesDeps } from './pets.routes';
import { fundraisingRoutes } from './fundraising.routes';
import { adoptionRoutes } from './adoption.routes';
import type { AdoptionRoutesDeps } from './adoption.routes';
import type { FundraisingRoutesDeps } from './fundraising.routes';
import { reportsRoutes } from './reports.routes';
import type { ReportsRoutesDeps } from './reports.routes';
import { locationsRoutes } from './locations.routes';
import type { LocationRoutesDeps } from './locations.routes';
import { animalTaxonomyRoutes } from './animal-taxonomy.routes';
import type { AnimalTaxonomyRoutesDeps } from './animal-taxonomy.routes';
import { walletRoutes } from './wallet.routes';
import type { WalletRoutesDeps } from './wallet.routes';

/**
 * Root route aggregator. Business-module routers (posts, profile, pets,
 * etc.) are intentionally not registered here yet â€” this foundation step
 * only wires up health/readiness/version endpoints.
 */
export interface RootRouterDeps
  extends
    HealthRoutesDeps,
    AuthRoutesDeps,
    SocialRoutesDeps,
    NotificationsRoutesDeps,
    ReportsRoutesDeps,
    PetRoutesDeps,
    FundraisingRoutesDeps,
    AdoptionRoutesDeps,
    LocationRoutesDeps,
    AnimalTaxonomyRoutesDeps,
    WalletRoutesDeps {}

export function rootRouter(deps: RootRouterDeps): Router {
  const router = Router();
  router.use(healthRoutes(deps));
  router.use(authRoutes(deps));
  router.use(notificationsRoutes(deps));
  router.use(reportsRoutes(deps));
  router.use(petRoutes(deps));
  router.use(socialRoutes(deps));
  router.use(fundraisingRoutes(deps));
  router.use(walletRoutes(deps));
  router.use(adoptionRoutes(deps));
  router.use(locationsRoutes(deps));
  router.use(animalTaxonomyRoutes(deps));
  return router;
}
