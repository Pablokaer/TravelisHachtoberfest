
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "api_cache": {
                  Row: {
                    "created_at": string,"expires_at": string,"key": string,"value": NonNullable<Json>
                  }
                  Insert: {
                    "created_at"?: string,"expires_at": string,"key": string,"value": NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"key"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"attraction_embeddings": {
                  Row: {
                    "attraction_id": string,"embedding": string,"model": string,"updated_at": string
                  }
                  Insert: {
                    "attraction_id": string,"embedding": string,"model": string,"updated_at"?: string
                  }
                  Update: {
                    "attraction_id"?: string,"embedding"?: string,"model"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attraction_embeddings_attraction_id_fkey"
      columns: ["attraction_id"]
isOneToOne: true
      referencedRelation: "attraction_details"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attraction_embeddings_attraction_id_fkey"
      columns: ["attraction_id"]
isOneToOne: true
      referencedRelation: "attraction_rating_summary"
      referencedColumns: ["attraction_id"]
    },{
      foreignKeyName: "attraction_embeddings_attraction_id_fkey"
      columns: ["attraction_id"]
isOneToOne: true
      referencedRelation: "attractions"
      referencedColumns: ["id"]
    }
                  ]
                },"attraction_review_totals": {
                  Row: {
                    "attraction_id": string,"rating_sum": number,"review_count": number
                  }
                  Insert: {
                    "attraction_id": string,"rating_sum"?: number,"review_count"?: number
                  }
                  Update: {
                    "attraction_id"?: string,"rating_sum"?: number,"review_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "attraction_review_totals_attraction_id_fkey"
      columns: ["attraction_id"]
isOneToOne: true
      referencedRelation: "attraction_details"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attraction_review_totals_attraction_id_fkey"
      columns: ["attraction_id"]
isOneToOne: true
      referencedRelation: "attraction_rating_summary"
      referencedColumns: ["attraction_id"]
    },{
      foreignKeyName: "attraction_review_totals_attraction_id_fkey"
      columns: ["attraction_id"]
isOneToOne: true
      referencedRelation: "attractions"
      referencedColumns: ["id"]
    }
                  ]
                },"attractions": {
                  Row: {
                    "avg_visit_minutes": number,"category": Database["public"]['Enums']["attraction_category"],"city_slug": string,"description_en": string | null,"description_pt": string | null,"fee": string | null,"history_en": string | null,"history_pt": string | null,"id": string,"image_author": string | null,"image_license": string | null,"image_license_url": string | null,"image_page_url": string | null,"image_url": string | null,"is_unesco": boolean,"location": unknown,"name_en": string,"name_pt": string | null,"opening_hours": string | null,"osm_id": string | null,"popularity": number,"summary_en": string | null,"summary_pt": string | null,"updated_at": string,"website": string | null,"wikidata_id": string,"wikipedia_en": string | null,"wikipedia_pt": string | null
                  }
                  Insert: {
                    "avg_visit_minutes": number,"category"?: Database["public"]['Enums']["attraction_category"],"city_slug": string,"description_en"?: string | null,"description_pt"?: string | null,"fee"?: string | null,"history_en"?: string | null,"history_pt"?: string | null,"id"?: string,"image_author"?: string | null,"image_license"?: string | null,"image_license_url"?: string | null,"image_page_url"?: string | null,"image_url"?: string | null,"is_unesco"?: boolean,"location": unknown,"name_en": string,"name_pt"?: string | null,"opening_hours"?: string | null,"osm_id"?: string | null,"popularity"?: number,"summary_en"?: string | null,"summary_pt"?: string | null,"updated_at"?: string,"website"?: string | null,"wikidata_id": string,"wikipedia_en"?: string | null,"wikipedia_pt"?: string | null
                  }
                  Update: {
                    "avg_visit_minutes"?: number,"category"?: Database["public"]['Enums']["attraction_category"],"city_slug"?: string,"description_en"?: string | null,"description_pt"?: string | null,"fee"?: string | null,"history_en"?: string | null,"history_pt"?: string | null,"id"?: string,"image_author"?: string | null,"image_license"?: string | null,"image_license_url"?: string | null,"image_page_url"?: string | null,"image_url"?: string | null,"is_unesco"?: boolean,"location"?: unknown,"name_en"?: string,"name_pt"?: string | null,"opening_hours"?: string | null,"osm_id"?: string | null,"popularity"?: number,"summary_en"?: string | null,"summary_pt"?: string | null,"updated_at"?: string,"website"?: string | null,"wikidata_id"?: string,"wikipedia_en"?: string | null,"wikipedia_pt"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attractions_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "attractions_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "city_list"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "attractions_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "city_profiles"
      referencedColumns: ["city_slug"]
    }
                  ]
                },"cities": {
                  Row: {
                    "bbox": (number)[],"center": unknown,"country_code": string,"history_en": string | null,"history_pt": string | null,"is_active": boolean,"name_en": string,"name_pt": string,"slug": string,"summary_en": string | null,"summary_pt": string | null,"timezone": string | null,"updated_at": string,"wikidata_id": string,"wikipedia_en": string | null,"wikipedia_pt": string | null
                  }
                  Insert: {
                    "bbox": (number)[],"center": unknown,"country_code": string,"history_en"?: string | null,"history_pt"?: string | null,"is_active"?: boolean,"name_en": string,"name_pt": string,"slug": string,"summary_en"?: string | null,"summary_pt"?: string | null,"timezone"?: string | null,"updated_at"?: string,"wikidata_id": string,"wikipedia_en"?: string | null,"wikipedia_pt"?: string | null
                  }
                  Update: {
                    "bbox"?: (number)[],"center"?: unknown,"country_code"?: string,"history_en"?: string | null,"history_pt"?: string | null,"is_active"?: boolean,"name_en"?: string,"name_pt"?: string,"slug"?: string,"summary_en"?: string | null,"summary_pt"?: string | null,"timezone"?: string | null,"updated_at"?: string,"wikidata_id"?: string,"wikipedia_en"?: string | null,"wikipedia_pt"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cities_country_code_fkey"
      columns: ["country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    }
                  ]
                },"city_climate": {
                  Row: {
                    "city_slug": string,"month": number,"precip_mm": number,"snowfall_cm": number,"sunshine_hours": number,"temp_max_c": number,"temp_mean_c": number
                  }
                  Insert: {
                    "city_slug": string,"month": number,"precip_mm": number,"snowfall_cm": number,"sunshine_hours": number,"temp_max_c": number,"temp_mean_c": number
                  }
                  Update: {
                    "city_slug"?: string,"month"?: number,"precip_mm"?: number,"snowfall_cm"?: number,"sunshine_hours"?: number,"temp_max_c"?: number,"temp_mean_c"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "city_climate_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "city_climate_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "city_list"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "city_climate_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "city_profiles"
      referencedColumns: ["city_slug"]
    }
                  ]
                },"city_facts": {
                  Row: {
                    "beach_count": number,"city_slug": string,"inception_year": number | null,"population": number | null
                  }
                  Insert: {
                    "beach_count"?: number,"city_slug": string,"inception_year"?: number | null,"population"?: number | null
                  }
                  Update: {
                    "beach_count"?: number,"city_slug"?: string,"inception_year"?: number | null,"population"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "city_facts_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: true
      referencedRelation: "cities"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "city_facts_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: true
      referencedRelation: "city_list"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "city_facts_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: true
      referencedRelation: "city_profiles"
      referencedColumns: ["city_slug"]
    }
                  ]
                },"city_prices": {
                  Row: {
                    "beer": number,"big_mac": number,"big_mac_is_real": boolean,"city_slug": string,"cocktail": number,"coffee": number,"currency": string,"local_dish": number,"meal_cheap": number,"meal_mid": number,"price_level": number,"retrieved_on": string,"soft_drink": number,"taxi_5km": number,"transport_ticket": number
                  }
                  Insert: {
                    "beer": number,"big_mac": number,"big_mac_is_real"?: boolean,"city_slug": string,"cocktail": number,"coffee": number,"currency"?: string,"local_dish": number,"meal_cheap": number,"meal_mid": number,"price_level": number,"retrieved_on": string,"soft_drink": number,"taxi_5km": number,"transport_ticket": number
                  }
                  Update: {
                    "beer"?: number,"big_mac"?: number,"big_mac_is_real"?: boolean,"city_slug"?: string,"cocktail"?: number,"coffee"?: number,"currency"?: string,"local_dish"?: number,"meal_cheap"?: number,"meal_mid"?: number,"price_level"?: number,"retrieved_on"?: string,"soft_drink"?: number,"taxi_5km"?: number,"transport_ticket"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "city_prices_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: true
      referencedRelation: "cities"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "city_prices_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: true
      referencedRelation: "city_list"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "city_prices_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: true
      referencedRelation: "city_profiles"
      referencedColumns: ["city_slug"]
    }
                  ]
                },"countries": {
                  Row: {
                    "ambulance_number": string | null,"calling_code": string | null,"code": string,"currency_codes": (string)[],"driving_side": string | null,"emergency_number": string | null,"fire_number": string | null,"frequency_hz": number | null,"is_eu": boolean,"is_schengen": boolean,"languages": (string)[],"name_en": string,"name_pt": string,"plug_types": (string)[],"police_number": string | null,"timezones": (string)[],"updated_at": string,"voltage": number | null
                  }
                  Insert: {
                    "ambulance_number"?: string | null,"calling_code"?: string | null,"code": string,"currency_codes"?: (string)[],"driving_side"?: string | null,"emergency_number"?: string | null,"fire_number"?: string | null,"frequency_hz"?: number | null,"is_eu"?: boolean,"is_schengen"?: boolean,"languages"?: (string)[],"name_en": string,"name_pt": string,"plug_types"?: (string)[],"police_number"?: string | null,"timezones"?: (string)[],"updated_at"?: string,"voltage"?: number | null
                  }
                  Update: {
                    "ambulance_number"?: string | null,"calling_code"?: string | null,"code"?: string,"currency_codes"?: (string)[],"driving_side"?: string | null,"emergency_number"?: string | null,"fire_number"?: string | null,"frequency_hz"?: number | null,"is_eu"?: boolean,"is_schengen"?: boolean,"languages"?: (string)[],"name_en"?: string,"name_pt"?: string,"plug_types"?: (string)[],"police_number"?: string | null,"timezones"?: (string)[],"updated_at"?: string,"voltage"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"future_trips": {
                  Row: {
                    "city_slug": string,"created_at": string,"planned_for": string | null,"reason": string | null,"user_id": string
                  }
                  Insert: {
                    "city_slug": string,"created_at"?: string,"planned_for"?: string | null,"reason"?: string | null,"user_id": string
                  }
                  Update: {
                    "city_slug"?: string,"created_at"?: string,"planned_for"?: string | null,"reason"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "future_trips_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "future_trips_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "city_list"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "future_trips_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "city_profiles"
      referencedColumns: ["city_slug"]
    }
                  ]
                },"moderators": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"nickname_login_failures": {
                  Row: {
                    "failed_at": string,"nickname": string
                  }
                  Insert: {
                    "failed_at"?: string,"nickname": string
                  }
                  Update: {
                    "failed_at"?: string,"nickname"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notable_people": {
                  Row: {
                    "birth_year": number | null,"born_here": boolean,"categories": (string)[],"city_slug": string,"created_at": string,"death_year": number | null,"description_en": string | null,"description_pt": string | null,"died_here": boolean,"image_author": string | null,"image_license": string | null,"image_license_url": string | null,"image_page_url": string | null,"image_url": string | null,"name_en": string,"name_pt": string | null,"sitelinks": number,"updated_at": string,"wikidata_id": string,"wikipedia_en": string | null,"wikipedia_pt": string | null
                  }
                  Insert: {
                    "birth_year"?: number | null,"born_here"?: boolean,"categories": (string)[],"city_slug": string,"created_at"?: string,"death_year"?: number | null,"description_en"?: string | null,"description_pt"?: string | null,"died_here"?: boolean,"image_author"?: string | null,"image_license"?: string | null,"image_license_url"?: string | null,"image_page_url"?: string | null,"image_url"?: string | null,"name_en": string,"name_pt"?: string | null,"sitelinks"?: number,"updated_at"?: string,"wikidata_id": string,"wikipedia_en"?: string | null,"wikipedia_pt"?: string | null
                  }
                  Update: {
                    "birth_year"?: number | null,"born_here"?: boolean,"categories"?: (string)[],"city_slug"?: string,"created_at"?: string,"death_year"?: number | null,"description_en"?: string | null,"description_pt"?: string | null,"died_here"?: boolean,"image_author"?: string | null,"image_license"?: string | null,"image_license_url"?: string | null,"image_page_url"?: string | null,"image_url"?: string | null,"name_en"?: string,"name_pt"?: string | null,"sitelinks"?: number,"updated_at"?: string,"wikidata_id"?: string,"wikipedia_en"?: string | null,"wikipedia_pt"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notable_people_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "notable_people_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "city_list"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "notable_people_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "city_profiles"
      referencedColumns: ["city_slug"]
    }
                  ]
                },"plans": {
                  Row: {
                    "billing_interval": string | null,"can_delete_lists": boolean,"created_at": string,"currency": string,"id": string,"is_default": boolean,"max_items_per_list": number | null,"max_lists": number | null,"price_cents": number,"sort_order": number
                  }
                  Insert: {
                    "billing_interval"?: string | null,"can_delete_lists": boolean,"created_at"?: string,"currency"?: string,"id": string,"is_default"?: boolean,"max_items_per_list"?: number | null,"max_lists"?: number | null,"price_cents": number,"sort_order"?: number
                  }
                  Update: {
                    "billing_interval"?: string | null,"can_delete_lists"?: boolean,"created_at"?: string,"currency"?: string,"id"?: string,"is_default"?: boolean,"max_items_per_list"?: number | null,"max_lists"?: number | null,"price_cents"?: number,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"profile_nationalities": {
                  Row: {
                    "country_code": string,"created_at": string,"profile_id": string
                  }
                  Insert: {
                    "country_code": string,"created_at"?: string,"profile_id": string
                  }
                  Update: {
                    "country_code"?: string,"created_at"?: string,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_nationalities_country_code_fkey"
      columns: ["country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "profile_nationalities_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_path": string | null,"avoid_countries": (string)[],"created_at": string,"display_name": string | null,"home_country": string | null,"id": string,"language": string,"nickname": string | null,"onboarded_at": string | null,"passport_expiry": string | null,"public_id": string,"theme": string,"units": string,"updated_at": string,"welcome_email_sent_at": string | null
                  }
                  Insert: {
                    "avatar_path"?: string | null,"avoid_countries"?: (string)[],"created_at"?: string,"display_name"?: string | null,"home_country"?: string | null,"id": string,"language"?: string,"nickname"?: string | null,"onboarded_at"?: string | null,"passport_expiry"?: string | null,"public_id"?: string,"theme"?: string,"units"?: string,"updated_at"?: string,"welcome_email_sent_at"?: string | null
                  }
                  Update: {
                    "avatar_path"?: string | null,"avoid_countries"?: (string)[],"created_at"?: string,"display_name"?: string | null,"home_country"?: string | null,"id"?: string,"language"?: string,"nickname"?: string | null,"onboarded_at"?: string | null,"passport_expiry"?: string | null,"public_id"?: string,"theme"?: string,"units"?: string,"updated_at"?: string,"welcome_email_sent_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_home_country_fkey"
      columns: ["home_country"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    }
                  ]
                },"reviews": {
                  Row: {
                    "attraction_id": string | null,"city_slug": string | null,"comment": string | null,"created_at": string,"id": string,"rating": number,"trip_id": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "attraction_id"?: string | null,"city_slug"?: string | null,"comment"?: string | null,"created_at"?: string,"id"?: string,"rating": number,"trip_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "attraction_id"?: string | null,"city_slug"?: string | null,"comment"?: string | null,"created_at"?: string,"id"?: string,"rating"?: number,"trip_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attraction_reviews_attraction_id_fkey"
      columns: ["attraction_id"]
isOneToOne: false
      referencedRelation: "attraction_details"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attraction_reviews_attraction_id_fkey"
      columns: ["attraction_id"]
isOneToOne: false
      referencedRelation: "attraction_rating_summary"
      referencedColumns: ["attraction_id"]
    },{
      foreignKeyName: "attraction_reviews_attraction_id_fkey"
      columns: ["attraction_id"]
isOneToOne: false
      referencedRelation: "attractions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "reviews_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "city_list"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "reviews_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "city_profiles"
      referencedColumns: ["city_slug"]
    },{
      foreignKeyName: "reviews_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"saved_trips": {
                  Row: {
                    "created_at": string,"trip_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"trip_id": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"trip_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_trips_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"subscriptions": {
                  Row: {
                    "cancelled_at": string | null,"created_at": string,"current_period_end": string | null,"id": string,"plan_id": string,"provider": string | null,"provider_subscription_id": string | null,"started_at": string,"status": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "cancelled_at"?: string | null,"created_at"?: string,"current_period_end"?: string | null,"id"?: string,"plan_id": string,"provider"?: string | null,"provider_subscription_id"?: string | null,"started_at"?: string,"status": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "cancelled_at"?: string | null,"created_at"?: string,"current_period_end"?: string | null,"id"?: string,"plan_id"?: string,"provider"?: string | null,"provider_subscription_id"?: string | null,"started_at"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    }
                  ]
                },"suggested_route_stops": {
                  Row: {
                    "attraction_id": string,"position": number,"route_id": string
                  }
                  Insert: {
                    "attraction_id": string,"position": number,"route_id": string
                  }
                  Update: {
                    "attraction_id"?: string,"position"?: number,"route_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "suggested_route_stops_attraction_id_fkey"
      columns: ["attraction_id"]
isOneToOne: false
      referencedRelation: "attraction_details"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "suggested_route_stops_attraction_id_fkey"
      columns: ["attraction_id"]
isOneToOne: false
      referencedRelation: "attraction_rating_summary"
      referencedColumns: ["attraction_id"]
    },{
      foreignKeyName: "suggested_route_stops_attraction_id_fkey"
      columns: ["attraction_id"]
isOneToOne: false
      referencedRelation: "attractions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "suggested_route_stops_route_id_fkey"
      columns: ["route_id"]
isOneToOne: false
      referencedRelation: "suggested_routes"
      referencedColumns: ["id"]
    }
                  ]
                },"suggested_routes": {
                  Row: {
                    "city_slug": string,"created_at": string,"distance_m": number,"generated_by": string,"id": string,"slug": string,"theme": string,"title_en": string,"title_pt": string,"updated_at": string,"visit_minutes": number,"walking_seconds": number
                  }
                  Insert: {
                    "city_slug": string,"created_at"?: string,"distance_m": number,"generated_by": string,"id": string,"slug": string,"theme": string,"title_en": string,"title_pt": string,"updated_at"?: string,"visit_minutes": number,"walking_seconds": number
                  }
                  Update: {
                    "city_slug"?: string,"created_at"?: string,"distance_m"?: number,"generated_by"?: string,"id"?: string,"slug"?: string,"theme"?: string,"title_en"?: string,"title_pt"?: string,"updated_at"?: string,"visit_minutes"?: number,"walking_seconds"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "suggested_routes_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "suggested_routes_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "city_list"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "suggested_routes_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "city_profiles"
      referencedColumns: ["city_slug"]
    }
                  ]
                },"trip_passwords": {
                  Row: {
                    "created_at": string,"password_hash": string,"trip_id": string
                  }
                  Insert: {
                    "created_at"?: string,"password_hash": string,"trip_id": string
                  }
                  Update: {
                    "created_at"?: string,"password_hash"?: string,"trip_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trip_passwords_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: true
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"trip_rating_counts": {
                  Row: {
                    "rating": number,"review_count": number,"trip_id": string
                  }
                  Insert: {
                    "rating": number,"review_count": number,"trip_id": string
                  }
                  Update: {
                    "rating"?: number,"review_count"?: number,"trip_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trip_rating_counts_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"trip_stops": {
                  Row: {
                    "attraction_id": string,"position": number,"trip_id": string
                  }
                  Insert: {
                    "attraction_id": string,"position": number,"trip_id": string
                  }
                  Update: {
                    "attraction_id"?: string,"position"?: number,"trip_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trip_stops_attraction_id_fkey"
      columns: ["attraction_id"]
isOneToOne: false
      referencedRelation: "attraction_details"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trip_stops_attraction_id_fkey"
      columns: ["attraction_id"]
isOneToOne: false
      referencedRelation: "attraction_rating_summary"
      referencedColumns: ["attraction_id"]
    },{
      foreignKeyName: "trip_stops_attraction_id_fkey"
      columns: ["attraction_id"]
isOneToOne: false
      referencedRelation: "attractions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trip_stops_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"trips": {
                  Row: {
                    "city_slug": string,"created_at": string,"distance_m": number | null,"id": string,"is_fallback": boolean,"is_official": boolean,"name": string,"provider": string | null,"rating_avg": number | null,"rating_sum": number,"review_count": number,"route_geometry": Json | null,"starts_at": string | null,"trip_date": string | null,"updated_at": string,"user_id": string,"visibility": string,"visit_minutes": number | null,"walking_seconds": number | null,"walklist_cover": Json | null
                  }
                  Insert: {
                    "city_slug": string,"created_at"?: string,"distance_m"?: number | null,"id"?: string,"is_fallback"?: boolean,"is_official"?: boolean,"name": string,"provider"?: string | null,"rating_avg"?: number | null,"rating_sum"?: number,"review_count"?: number,"route_geometry"?: Json | null,"starts_at"?: string | null,"trip_date"?: string | null,"updated_at"?: string,"user_id"?: string,"visibility"?: string,"visit_minutes"?: number | null,"walking_seconds"?: number | null
                  }
                  Update: {
                    "city_slug"?: string,"created_at"?: string,"distance_m"?: number | null,"id"?: string,"is_fallback"?: boolean,"is_official"?: boolean,"name"?: string,"provider"?: string | null,"rating_avg"?: number | null,"rating_sum"?: number,"review_count"?: number,"route_geometry"?: Json | null,"starts_at"?: string | null,"trip_date"?: string | null,"updated_at"?: string,"user_id"?: string,"visibility"?: string,"visit_minutes"?: number | null,"walking_seconds"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "trips_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "trips_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "city_list"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "trips_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "city_profiles"
      referencedColumns: ["city_slug"]
    }
                  ]
                },"visa_requirements": {
                  Row: {
                    "destination": string,"max_stay_days": number | null,"passport": string,"requirement": Database["public"]['Enums']["visa_requirement"],"source": string,"updated_at": string
                  }
                  Insert: {
                    "destination": string,"max_stay_days"?: number | null,"passport": string,"requirement": Database["public"]['Enums']["visa_requirement"],"source"?: string,"updated_at"?: string
                  }
                  Update: {
                    "destination"?: string,"max_stay_days"?: number | null,"passport"?: string,"requirement"?: Database["public"]['Enums']["visa_requirement"],"source"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"visited_attractions": {
                  Row: {
                    "attraction_id": string,"user_id": string,"visited_at": string
                  }
                  Insert: {
                    "attraction_id": string,"user_id": string,"visited_at"?: string
                  }
                  Update: {
                    "attraction_id"?: string,"user_id"?: string,"visited_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "visited_attractions_attraction_id_fkey"
      columns: ["attraction_id"]
isOneToOne: false
      referencedRelation: "attraction_details"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "visited_attractions_attraction_id_fkey"
      columns: ["attraction_id"]
isOneToOne: false
      referencedRelation: "attraction_rating_summary"
      referencedColumns: ["attraction_id"]
    },{
      foreignKeyName: "visited_attractions_attraction_id_fkey"
      columns: ["attraction_id"]
isOneToOne: false
      referencedRelation: "attractions"
      referencedColumns: ["id"]
    }
                  ]
                },"walk_attendees": {
                  Row: {
                    "created_at": string,"trip_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"trip_id": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"trip_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "walk_attendees_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"walk_messages": {
                  Row: {
                    "body": string,"created_at": string,"id": string,"trip_id": string,"user_id": string
                  }
                  Insert: {
                    "body": string,"created_at"?: string,"id"?: string,"trip_id": string,"user_id"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: string,"trip_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "walk_messages_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "attraction_details": {
                  Row: {
                    "avg_visit_minutes": number | null,"category": Database["public"]['Enums']["attraction_category"] | null,"city_slug": string | null,"description_en": string | null,"description_pt": string | null,"fee": string | null,"history_en": string | null,"history_pt": string | null,"id": string | null,"image_author": string | null,"image_license": string | null,"image_license_url": string | null,"image_page_url": string | null,"image_url": string | null,"is_unesco": boolean | null,"lat": number | null,"lng": number | null,"name_en": string | null,"name_pt": string | null,"opening_hours": string | null,"osm_id": string | null,"popularity": number | null,"summary_en": string | null,"summary_pt": string | null,"website": string | null,"wikidata_id": string | null,"wikipedia_en": string | null,"wikipedia_pt": string | null
                  }
                  Insert: {
                           "avg_visit_minutes"?: number | null,"category"?: Database["public"]['Enums']["attraction_category"] | null,"city_slug"?: string | null,"description_en"?: string | null,"description_pt"?: string | null,"fee"?: string | null,"history_en"?: string | null,"history_pt"?: string | null,"id"?: string | null,"image_author"?: string | null,"image_license"?: string | null,"image_license_url"?: string | null,"image_page_url"?: string | null,"image_url"?: string | null,"is_unesco"?: boolean | null,"lat"?: never,"lng"?: never,"name_en"?: string | null,"name_pt"?: string | null,"opening_hours"?: string | null,"osm_id"?: string | null,"popularity"?: number | null,"summary_en"?: string | null,"summary_pt"?: string | null,"website"?: string | null,"wikidata_id"?: string | null,"wikipedia_en"?: string | null,"wikipedia_pt"?: string | null
                         }
                        Update: {
                           "avg_visit_minutes"?: number | null,"category"?: Database["public"]['Enums']["attraction_category"] | null,"city_slug"?: string | null,"description_en"?: string | null,"description_pt"?: string | null,"fee"?: string | null,"history_en"?: string | null,"history_pt"?: string | null,"id"?: string | null,"image_author"?: string | null,"image_license"?: string | null,"image_license_url"?: string | null,"image_page_url"?: string | null,"image_url"?: string | null,"is_unesco"?: boolean | null,"lat"?: never,"lng"?: never,"name_en"?: string | null,"name_pt"?: string | null,"opening_hours"?: string | null,"osm_id"?: string | null,"popularity"?: number | null,"summary_en"?: string | null,"summary_pt"?: string | null,"website"?: string | null,"wikidata_id"?: string | null,"wikipedia_en"?: string | null,"wikipedia_pt"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "attractions_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "attractions_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "city_list"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "attractions_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "city_profiles"
      referencedColumns: ["city_slug"]
    }
                  ]
                },"attraction_rating_summary": {
                  Row: {
                    "attraction_id": string | null,"city_slug": string | null,"rating_avg": number | null,"review_count": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attractions_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "attractions_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "city_list"
      referencedColumns: ["slug"]
    },{
      foreignKeyName: "attractions_city_slug_fkey"
      columns: ["city_slug"]
isOneToOne: false
      referencedRelation: "city_profiles"
      referencedColumns: ["city_slug"]
    }
                  ]
                },"city_list": {
                  Row: {
                    "attraction_count": number | null,"bbox": (number)[] | null,"country_code": string | null,"country_name_en": string | null,"country_name_pt": string | null,"cover_image_author": string | null,"cover_image_license": string | null,"cover_image_url": string | null,"lat": number | null,"lng": number | null,"name_en": string | null,"name_pt": string | null,"slug": string | null,"timezone": string | null,"wikidata_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cities_country_code_fkey"
      columns: ["country_code"]
isOneToOne: false
      referencedRelation: "countries"
      referencedColumns: ["code"]
    }
                  ]
                },"city_profiles": {
                  Row: {
                    "attraction_count": number | null,"castle_count": number | null,"church_count": number | null,"city_slug": string | null,"landmark_count": number | null,"monument_count": number | null,"museum_count": number | null,"nature_count": number | null,"palace_count": number | null,"park_count": number | null,"unesco_count": number | null,"viewpoint_count": number | null
                  }
                  Relationships: [
                    
                  ]
                },"rating_summary": {
                  Row: {
                    "attraction_id": string | null,"city_slug": string | null,"rating_avg": number | null,"rating_counts": (number)[] | null,"review_count": number | null,"trip_id": string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "apply_review_deltas":
{ Args: { "p_deltas": (Database["public"]['CompositeTypes']["review_delta"])[] }; Returns: undefined
                           },
"apply_trip_rating_deltas":
{ Args: { "p_deltas": (Database["public"]['CompositeTypes']["trip_rating_delta"])[] }; Returns: undefined
                           },
"attractions_in_view":
{ Args: { "categories"?: (Database["public"]['Enums']["attraction_category"])[],"max_lat": number,"max_lng": number,"max_results"?: number,"min_lat": number,"min_lng": number }; Returns: {
              "avg_visit_minutes": number,"category": Database["public"]['Enums']["attraction_category"],"city_slug": string,"id": string,"image_url": string,"is_unesco": boolean,"lat": number,"lng": number,"name_en": string,"name_pt": string,"popularity": number
            }[]
                           },
"checklist_place":
{ Args: { "p_city": string,"p_home": string }; Returns: Json
                           },
"claim_welcome_email":
{ Args: { "p_user": string }; Returns: {
              "display_name": string,"email": string,"language": string
            }[]
                           },
"current_subscription":
{ Args: { "p_user_id": string }; Returns: {
              "cancelled_at": string | null,
"created_at": string,
"current_period_end": string | null,
"id": string,
"plan_id": string,
"provider": string | null,
"provider_subscription_id": string | null,
"started_at": string,
"status": string,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "subscriptions"
        isOneToOne: true
        isSetofReturn: false
      } },
"delete_account":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"delete_trip":
{ Args: { "p_trip_id": string }; Returns: undefined
                           },
"effective_plan":
{ Args: { "p_user_id": string }; Returns: {
              "billing_interval": string | null,
"can_delete_lists": boolean,
"created_at": string,
"currency": string,
"id": string,
"is_default": boolean,
"max_items_per_list": number | null,
"max_lists": number | null,
"price_cents": number,
"sort_order": number
            }
                          SetofOptions: {
        from: "*"
        to: "plans"
        isOneToOne: true
        isSetofReturn: false
      } },
"is_moderator":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_walk_chat_member":
{ Args: { "p_trip_id": string }; Returns: boolean
                           },
"list_reviews":
{ Args: { "p_attraction_id"?: string,"p_city_slug"?: string,"p_limit"?: number,"p_offset"?: number,"p_trip_id"?: string }; Returns: {
              "author_avatar_path": string,"author_name": string,"author_public_id": string,"comment": string,"created_at": string,"id": string,"is_own": boolean,"rating": number,"updated_at": string
            }[]
                           },
"list_walk_messages":
{ Args: { "p_after"?: string,"p_before"?: string,"p_limit"?: number,"p_trip_id": string }; Returns: {
              "author_avatar_path": string,"author_name": string,"author_nickname": string,"author_public_id": string,"body": string,"created_at": string,"id": string,"is_own": boolean
            }[]
                           },
"list_walk_participants":
{ Args: { "p_limit"?: number,"p_trip_id": string }; Returns: {
              "avatar_path": string,"is_organiser": boolean,"is_self": boolean,"name": string,"participant_count": number
            }[]
                           },
"list_walklists":
{ Args: { "p_author"?: string,"p_city_slug"?: string,"p_limit"?: number,"p_official"?: boolean,"p_offset"?: number,"p_saved"?: boolean,"p_search"?: string,"p_sort"?: string,"p_upcoming"?: boolean }; Returns: {
              "attendee_count": number,"author_name": string,"author_public_id": string,"city_slug": string,"cover": Json,"created_at": string,"distance_m": number,"id": string,"is_attending": boolean,"is_official": boolean,"is_own": boolean,"is_saved": boolean,"name": string,"rating_avg": number,"review_count": number,"starts_at": string,"stop_count": number,"visibility": string,"visit_minutes": number,"walking_seconds": number
            }[]
                           },
"login_email_for_nickname":
{ Args: { "p_nickname": string,"p_password": string }; Returns: string
                           },
"my_subscription":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"nickname_available":
{ Args: { "p_nickname": string }; Returns: boolean
                           },
"normalize_nickname":
{ Args: { "p_nickname": string }; Returns: string
                           },
"public_profile":
{ Args: { "p_public_id": string }; Returns: Json
                           },
"release_welcome_email":
{ Args: { "p_user": string }; Returns: undefined
                           },
"save_review":
{ Args: { "p_attraction_id"?: string,"p_city_slug"?: string,"p_comment"?: string,"p_rating": number,"p_trip_id"?: string }; Returns: string
                           },
"save_trip":
{ Args: { "p_attraction_ids": (string)[],"p_city_slug": string,"p_distance_m"?: number,"p_is_fallback"?: boolean,"p_name": string,"p_provider"?: string,"p_route_geometry"?: Json,"p_starts_at"?: string,"p_trip_date"?: string,"p_visit_minutes"?: number,"p_walking_seconds"?: number }; Returns: string
                           },
"search_attractions_hybrid":
{ Args: { "in_city"?: string,"match_count"?: number,"query_embedding": string,"query_text": string }; Returns: {
              "category": Database["public"]['Enums']["attraction_category"],"city_slug": string,"id": string,"keyword_pos": number,"name_en": string,"score": number,"vector_pos": number
            }[]
                           },
"set_nationalities":
{ Args: { "codes": (string)[] }; Returns: undefined
                           },
"set_trip_official":
{ Args: { "p_official": boolean,"p_trip_id": string }; Returns: undefined
                           },
"set_trip_schedule":
{ Args: { "p_starts_at": string,"p_trip_id": string }; Returns: undefined
                           },
"set_trip_visibility":
{ Args: { "p_password"?: string,"p_trip_id": string,"p_visibility": string }; Returns: undefined
                           },
"set_walk_attendance":
{ Args: { "p_attending": boolean,"p_trip_id": string }; Returns: Json
                           },
"shared_trip":
{ Args: { "p_password"?: string,"p_trip_id": string }; Returns: Json
                           },
"subscription_grants_plan":
{ Args: { "p_period_end": string,"p_status": string }; Returns: boolean
                           },
"trip_open_to_caller":
{ Args: { "p_trip_id": string }; Returns: boolean
                           },
"trip_visible_to_caller":
{ Args: { "p_trip_id": string }; Returns: boolean
                           },
"visa_options_for_city":
{ Args: { "p_city": string,"p_passports": (string)[] }; Returns: {
              "max_stay_days": number,"passport": string,"requirement": Database["public"]['Enums']["visa_requirement"]
            }[]
                           },
"walk_open_to_join":
{ Args: { "p_trip_id": string }; Returns: boolean
                           },
"walklist_cover":
{ Args: { "p_trip": Database["public"]['Tables']["trips"]['Row'] }; Returns: Json
                           }
          }
          Enums: {
            "attraction_category": "museum"|"monument"|"church"|"castle"|"viewpoint"|"landmark"|"park"|"nature"|"palace"|"other","visa_requirement": "freedom_of_movement"|"visa_free"|"visa_on_arrival"|"eta"|"e_visa"|"visa_required"|"no_admission"
          }
          CompositeTypes: {
            "review_delta": {
                        "attraction_id": string | null,"trip_id": string | null,"n": number | null,"s": number | null
                      },"trip_rating_delta": {
                        "trip_id": string | null,"rating": number | null,"n": number | null
                      }
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "attraction_category": ["museum", "monument", "church", "castle", "viewpoint", "landmark", "park", "nature", "palace", "other"],"visa_requirement": ["freedom_of_movement", "visa_free", "visa_on_arrival", "eta", "e_visa", "visa_required", "no_admission"]
          }
        }
} as const

