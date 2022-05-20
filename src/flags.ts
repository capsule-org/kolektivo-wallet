// Feature flags
export const features = {
  USE_COMMENT_ENCRYPTION: true,
  DATA_SAVER: true,
  PHONE_NUM_METADATA_IN_TRANSFERS: true,
  VERIFICATION_FORNO_RETRY: true,
  PNP_USE_DEK_FOR_AUTH: true,
  SHOW_INVITE_MENU_ITEM: false,
}

// Country specific features, unlisted countries are set to `false` by default
// Using 2 letters alpha code. See https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2
export const countryFeatures = {
  RESTRICTED_CP_DOTO: {
    JP: true,
    PH: true,
  },
  SANCTIONED_COUNTRY: {
    IR: true,
    CU: true,
    KP: true,
    SD: true,
    SY: true,
  },
  IS_IN_EUROPE: {
    // All european countries, taken from https://www.europeancuisines.com/Europe-European-Two-Letter-Country-Code-Abbreviations
    AL: true,
    AD: true,
    AM: true,
    AT: true,
    BY: true,
    BE: true,
    BA: true,
    BG: true,
    CH: true,
    CY: true,
    CZ: true,
    DE: true,
    DK: true,
    EE: true,
    ES: true,
    FO: true,
    FI: true,
    FR: true,
    GB: true,
    GE: true,
    GI: true,
    GR: true,
    HU: true,
    HR: true,
    IE: true,
    IS: true,
    IT: true,
    LT: true,
    LU: true,
    LV: true,
    MC: true,
    MK: true,
    MT: true,
    NO: true,
    NL: true,
    PO: true,
    PT: true,
    RO: true,
    RU: true,
    SE: true,
    SI: true,
    SK: true,
    SM: true,
    TR: true,
    UA: true,
    VA: true,
  },
}
