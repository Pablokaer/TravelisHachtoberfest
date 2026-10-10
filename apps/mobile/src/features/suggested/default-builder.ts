// The city builder this build talks to (D-079); null when EXPO_PUBLIC_CITY_BUILDER_URL is unset.
import { env } from '@/lib/env';
import { HttpCityBuilder, type CityBuilder } from './city-builder';

export const defaultBuilder: CityBuilder | null = env.cityBuilderUrl
  ? new HttpCityBuilder(env.cityBuilderUrl)
  : null;
