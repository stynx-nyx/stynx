/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type PreferencePatch = {
    accessibility?: ({
        largeText?: (boolean | null);
        reduceMotion?: (boolean | null);
        screenReaderOptimized?: (boolean | null);
    } | null);
    locale?: ({
        locale?: (string | null);
        timezone?: (string | null);
    } | null);
    notificationDelivery?: ({
        email?: (boolean | null);
        inApp?: (boolean | null);
        push?: (boolean | null);
    } | null);
    theme?: ({
        colorScheme?: ('system' | 'light' | 'dark' | null);
        contrast?: ('standard' | 'more' | null);
        density?: ('comfortable' | 'compact' | null);
    } | null);
};

