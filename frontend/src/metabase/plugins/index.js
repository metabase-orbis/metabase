import PluginPlaceholder from "metabase/plugins/components/PluginPlaceholder";
// Plugin integration points. All exports must be objects or arrays so they can be mutated by plugins.

// functions called when the application is started
export const PLUGIN_APP_INIT_FUCTIONS = [];

// function to determine the landing page
export const PLUGIN_LANDING_PAGE = [];

// override for LogoIcon
export const PLUGIN_LOGO_ICON_COMPONENTS = [];

// admin nav items and routes
export const PLUGIN_ADMIN_NAV_ITEMS = [];
export const PLUGIN_ADMIN_ROUTES = [];

// functions that update the sections
export const PLUGIN_ADMIN_SETTINGS_UPDATES = [];

// admin permissions grid
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES = [];
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS = [];
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS = {
  controlled: [],
};
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION = {
  controlled: null,
};
export const PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_PERMISSION_VALUE = {
  controlled: null,
};

// user form fields, e.x. login attributes
export const PLUGIN_ADMIN_USER_FORM_FIELDS = [];

// authentication providers
export const PLUGIN_AUTH_PROVIDERS = [];

// Only show the password tab in account settings if these functions all return true
export const PLUGIN_SHOW_CHANGE_PASSWORD_CONDITIONS = [];

// selectors that customize behavior between app versions
export const PLUGIN_SELECTORS = {
  getShowAuthScene: (state, props) => true,
  getLogoBackgroundClass: (state, props) => "bg-white",
};

export const PLUGIN_FORM_WIDGETS = {};

// snippet sidebar
export const PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS = [];
export const PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS = {};
export const PLUGIN_SNIPPET_SIDEBAR_MODALS = [];
export const PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS = [];

export const PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE = {
  Component: undefined,
};

const AUTHORITY_LEVEL_REGULAR = {
  type: null,
  icon: "folder",
};

export const PLUGIN_COLLECTIONS = {
  formFields: [],
  AUTHORITY_LEVEL: {
    [AUTHORITY_LEVEL_REGULAR.type]: AUTHORITY_LEVEL_REGULAR,
    regular: AUTHORITY_LEVEL_REGULAR, // just an alias
  },
};

export const PLUGIN_COLLECTION_COMPONENTS = {
  CollectionAuthorityLevelIcon: PluginPlaceholder,
};
