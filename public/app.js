/* ============================
   PreCheck - Full App (Plain HTML + JS)
   Data: Embedded from PreCheck_Items_Master.xlsx (128 rows)
   Features:
   - Expiry modes: AUTO / MANUAL / EOD / HOURLY / HOURLY_FIXED
   - Helper text
   - Sauce sub-category navigation
   - SKH-only item: Beef Taco (H)
   - Save confirmation popup (always)
   - Validation: blocks only when required expiry input missing (quantity can be 0 and is NOT required)
   - History / Records (staff)
   - Manager-only: Expiring (PDD/SKH tabs), Export CSV, Add items in-app (name/category/shelf life)
   Manager PIN default: 1234 (saved in browser)
   ============================ */

const App = (() => {
  // ---- Local storage keys
  const LS = {
    ITEMS: "precheck.items.v2",
    LOGS: "precheck.logs.v2",
    STAFF: "precheck.staff.v2",
    STORE: "precheck.store.v2",
    MGR_PIN: "precheck.manager.pin.v2",
    MGR_AUTH: "precheck.manager.authed.v2",
  };

  // ---- Expiry modes
  const MODE = {
    AUTO: "AUTO",           // now + (shelf_life_days * 24h) or rule hours
    MANUAL: "MANUAL",       // staff pick datetime
    EOD: "EOD",             // end of day 23:59
    HOURLY: "HOURLY",       // now + hours
    HOURLY_FIXED: "HOURLY_FIXED", // staff pick slot time today (11/15/19/23), allowed even if already passed
  };

  // ---- Hourly fixed dropdown slots
  const HOURLY_SLOTS = [
    { label: "11:00 AM", value: "11:00" },
    { label: "3:00 PM",  value: "15:00" },
    { label: "7:00 PM",  value: "19:00" },
    { label: "11:00 PM", value: "23:00" },
  ];

  // ---- Categories (menu)
  const CATEGORIES = [
    "Prepared items",
    "Unopened chiller",
    "Thawing",
    "Vegetables",
    "Backroom",
    "Back counter",
    "Front counter",
    "Back counter chiller",
    "Sauce",
  ];

  const SAUCE_SUBS = ["Standby", "Open Inner", "Sandwich Unit"];

  // ---- Embedded source rows from Excel (do not edit unless you want)
  const EMBEDDED_ITEMS = [{"id": "seed-001", "name": "Tuna Cambro", "category": "Prepared Items", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-002", "name": "Egg Cambro", "category": "Prepared Items", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-003", "name": "RC Cambro", "category": "Prepared Items", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-004", "name": "Chicken Ham Cambro", "category": "Prepared Items", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-005", "name": "Beef Brisket Cambro", "category": "Prepared Items", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-006", "name": "Chicken Thigh Cambro", "category": "Prepared Items", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-007", "name": "CCT Cambro", "category": "Prepared Items", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-008", "name": "Bologna Cambro", "category": "Prepared Items", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-009", "name": "Salami Cambro", "category": "Prepared Items", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-010", "name": "Pepperoni Cambro", "category": "Prepared Items", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-011", "name": "Teriyaki Cambro", "category": "Prepared Items", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-012", "name": "Mac N Cheese", "category": "Prepared Items", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-013", "name": "Bacon Cambro", "category": "Prepared Items", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-014", "name": "Nuggets Cambro", "category": "Prepared Items", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-015", "name": "Chorizo Cambro", "category": "Prepared Items", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-016", "name": "Liquid Egg Cambro", "category": "Prepared Items", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-017", "name": "Beef Taco Cambro", "category": "Prepared Items", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-018", "name": "Mushroom Soup Cambro", "category": "Prepared Items", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-019", "name": "Tomato Soup Cambro", "category": "Prepared Items", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-020", "name": "Rotisserie", "category": "Prepared Items", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-021", "name": "Chicken Strips", "category": "Prepared Items", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-022", "name": "Beef Brisket", "category": "High Risk", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-023", "name": "Liquid Egg Packet", "category": "High Risk", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-024", "name": "Liquid Egg Box", "category": "High Risk", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-025", "name": "Beef Taco", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-026", "name": "Mushroom Soup", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-027", "name": "Tomato Soup", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-028", "name": "Avocado", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-029", "name": "Caramelised Onion", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-030", "name": "Cauliflower", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-031", "name": "Mac N Cheese", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-032", "name": "Wrap", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-033", "name": "Flat Bread", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-034", "name": "Mozzarella Cheese", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-035", "name": "Chicken Ham", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-036", "name": "Chorizo", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-037", "name": "Turkey Bologna", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-038", "name": "Turkey Ham", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-039", "name": "Chicken Strips", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-040", "name": "Roasted Chicken", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-041", "name": "Chicken Thigh", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-042", "name": "Nuggets", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-043", "name": "Pepperoni", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-044", "name": "Salami", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-045", "name": "Rotisserie", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-046", "name": "Bacon", "category": "Thawing", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-047", "name": "Onion", "category": "Vegetables", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-048", "name": "Lettuce", "category": "Vegetables", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-049", "name": "Mix Green", "category": "Vegetables", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-050", "name": "Tomato", "category": "Vegetables", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-051", "name": "Cucumber", "category": "Vegetables", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-052", "name": "Green Capsicum", "category": "Vegetables", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-053", "name": "Canola Oil Cooking Spray", "category": "Backroom", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-054", "name": "Salt Open Inner", "category": "Backroom", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-055", "name": "Pepper Open Inner", "category": "Backroom", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-056", "name": "Olive Open Bottle", "category": "Backroom", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-057", "name": "Parmesan Oregano", "category": "Backroom", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-058", "name": "Shallot", "category": "Backroom", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-059", "name": "Honey Oat", "category": "Backroom", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-060", "name": "Parmesan Open Inner", "category": "Backroom", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-061", "name": "Shallot Open Inner", "category": "Backroom", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-062", "name": "Honey Oat Open Inner", "category": "Backroom", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-063", "name": "Cajun Spice", "category": "Backroom", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-064", "name": "Cajun Spice Open Inner", "category": "Backroom", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-065", "name": "Salt", "category": "Front Counter", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-066", "name": "Pepper", "category": "Front Counter", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-067", "name": "Cookies", "category": "Front Counter", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-068", "name": "Olive Oil", "category": "Front Counter", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-069", "name": "Milk", "category": "Front Counter", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-070", "name": "Milo", "category": "Front Counter", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-071", "name": "Tea Bag", "category": "Front Counter", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-072", "name": "Coffee Bean Hopper", "category": "Front Counter", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-073", "name": "Coffee Bean Open Inner", "category": "Front Counter", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-074", "name": "Wrap", "category": "Front Counter", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-075", "name": "Flatbread", "category": "Front Counter", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-076", "name": "Bread", "category": "Front Counter", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-077", "name": "Mushroom Soup", "category": "Front Counter", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-078", "name": "Tomato Soup", "category": "Front Counter", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-079", "name": "Beef Taco", "category": "Front Counter", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-080", "name": "Tomato Ketchup", "category": "Sauce", "sub_category": "Sandwich Unit", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-081", "name": "Mustard", "category": "Sauce", "sub_category": "Sandwich Unit", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-082", "name": "Ranch", "category": "Sauce", "sub_category": "Sandwich Unit", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-083", "name": "Caesar Sauce", "category": "Sauce", "sub_category": "Sandwich Unit", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-084", "name": "Spicy Mayo Sauce", "category": "Sauce", "sub_category": "Sandwich Unit", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-085", "name": "BBQ Sauce", "category": "Sauce", "sub_category": "Sandwich Unit", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-086", "name": "Chipotle Southwest", "category": "Sauce", "sub_category": "Sandwich Unit", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-087", "name": "Chili Sauce", "category": "Sauce", "sub_category": "Sandwich Unit", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-088", "name": "Honey Mustard", "category": "Sauce", "sub_category": "Sandwich Unit", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-089", "name": "Sweet Onion", "category": "Sauce", "sub_category": "Sandwich Unit", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-090", "name": "Mayonnaise", "category": "Sauce", "sub_category": "Sandwich Unit", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-091", "name": "Teriyaki Sauce", "category": "Sauce", "sub_category": "Sandwich Unit", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-092", "name": "Jalapeños Cheese", "category": "Sauce", "sub_category": "Sandwich Unit", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-093", "name": "Tomato Ketchup", "category": "Sauce", "sub_category": "Standby", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-094", "name": "Mustard", "category": "Sauce", "sub_category": "Standby", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-095", "name": "Ranch", "category": "Sauce", "sub_category": "Standby", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-096", "name": "Caesar Sauce", "category": "Sauce", "sub_category": "Standby", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-097", "name": "Spicy Mayo Sauce", "category": "Sauce", "sub_category": "Standby", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-098", "name": "BBQ Sauce", "category": "Sauce", "sub_category": "Standby", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-099", "name": "Chipotle Southwest", "category": "Sauce", "sub_category": "Standby", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-100", "name": "Chili Sauce", "category": "Sauce", "sub_category": "Standby", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-101", "name": "Honey Mustard", "category": "Sauce", "sub_category": "Standby", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-102", "name": "Sweet Onion", "category": "Sauce", "sub_category": "Standby", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-103", "name": "Mayonnaise", "category": "Sauce", "sub_category": "Standby", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-104", "name": "Teriyaki Sauce", "category": "Sauce", "sub_category": "Standby", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-105", "name": "Jalapeños Cheese", "category": "Sauce", "sub_category": "Standby", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-106", "name": "Tomato Ketchup", "category": "Sauce", "sub_category": "Open Inner", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-107", "name": "Mustard", "category": "Sauce", "sub_category": "Open Inner", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-108", "name": "Ranch", "category": "Sauce", "sub_category": "Open Inner", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-109", "name": "Caesar Sauce", "category": "Sauce", "sub_category": "Open Inner", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-110", "name": "Spicy Mayo Sauce", "category": "Sauce", "sub_category": "Open Inner", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-111", "name": "BBQ Sauce", "category": "Sauce", "sub_category": "Open Inner", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-112", "name": "Chipotle Southwest", "category": "Sauce", "sub_category": "Open Inner", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-113", "name": "Chili Sauce", "category": "Sauce", "sub_category": "Open Inner", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-114", "name": "Honey Mustard", "category": "Sauce", "sub_category": "Open Inner", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-115", "name": "Sweet Onion", "category": "Sauce", "sub_category": "Open Inner", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-116", "name": "Mayonnaise", "category": "Sauce", "sub_category": "Open Inner", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-117", "name": "Teriyaki Sauce", "category": "Sauce", "sub_category": "Open Inner", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-118", "name": "Jalapeños Cheese", "category": "Sauce", "sub_category": "Open Inner", "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-119", "name": "Sausage", "category": "Back Counter Chiller", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-120", "name": "Cheddar Cheese", "category": "Back Counter Chiller", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-121", "name": "Mix Green", "category": "Back Counter Chiller", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-122", "name": "Mozzarella", "category": "Back Counter Chiller", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-123", "name": "Corn", "category": "Back Counter Chiller", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-124", "name": "Olive", "category": "Back Counter Chiller", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-125", "name": "Jalapeno", "category": "Back Counter Chiller", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-126", "name": "Pickles", "category": "Back Counter Chiller", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-127", "name": "Mushroom", "category": "Back Counter Chiller", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}, {"id": "seed-128", "name": "Nuggets", "category": "Back Counter Chiller", "sub_category": null, "shelf_life_days": null, "stores": ["PDD", "SKH"]}];

  // ---- App state
  const state = {
    store: "PDD",
    staff: "",
    managerAuthed: false,

    screen: "HOME", // HOME | ITEMS | SAUCE_SUBS | SAUCE_ITEMS | RECORD | HISTORY | EXPIRING | MGR_ADD
    selectedCategory: null,
    selectedSauceSub: null,
    selectedItemId: null,

    qty: "",                 // quantity input (0 allowed)
    manualExpiry: "",         // datetime-local
    hourlySlot: "",           // "HH:MM"
    error: "",

    pendingSave: null,

    historyStore: "ALL",
    historyDate: "TODAY",
    historyCategory: "ALL",

    expiringTab: "PDD",

    mgrName: "",
    mgrCategory: "Prepared items",
    mgrShelfDays: "",
    mgrStores: "PDD,SKH",
    mgrSauceSub: "Standby",
    mgrError: "",
  };

  // ---- DOM helpers
  const $ = (id) => document.getElementById(id);

  function esc(s) {
    const v = String(s ?? "");
    return v
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function now() { return new Date(); }

  function pad2(n) { return String(n).padStart(2,"0"); }

  function toDTLocalValue(d) {
    const x = new Date(d);
    return `${x.getFullYear()}-${pad2(x.getMonth()+1)}-${pad2(x.getDate())}T${pad2(x.getHours())}:${pad2(x.getMinutes())}`;
  }

  function parseDTLocal(v) {
    if (!v) return null;
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  function lsGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function lsSet(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // ---- Normalization / mapping
  function normalizeName(name) {
    let n = String(name ?? "").trim();
    // remove "cambro" word (case-insensitive)
    n = n.replace(/\bcambro\b/ig, "").trim();
    n = n.replace(/\s{2,}/g, " ");
    return n;
  }

  function normalizeCategory(cat) {
    const c = String(cat ?? "").trim();

    // IMPORTANT: keep display name "Back counter chiller" (as you requested)
    const map = {
      "Prepared Items": "Prepared items",
      "Prepared items": "Prepared items",
      "High Risk": "Unopened chiller",
      "Unopened chiller": "Unopened chiller",
      "Back Counter Chiller": "Back counter chiller",
      "Back counter chiller": "Back counter chiller",
      "Backroom": "Backroom",
      "Front counter": "Front counter",
      "Front Counter": "Front counter",
      "Back counter": "Back counter",
      "Back Counter": "Back counter",
      "Thawing": "Thawing",
      "Vegetables": "Vegetables",
      "Sauce": "Sauce",
    };
    return map[c] || c;
  }

  function normalizeSub(sub) {
    const s = String(sub ?? "").trim();
    // keep as-is if matches expected, else blank
    if (SAUCE_SUBS.includes(s)) return s;
    return s; // allow custom if present
  }

  // ---- Rules (your final requirements)
  function applyRules(raw) {
    const item = { ...raw };
    item.name = normalizeName(item.name);
    item.category = normalizeCategory(item.category);
    item.sub_category = normalizeSub(item.sub_category);

    const lname = item.name.toLowerCase();

    // stores default
    if (!Array.isArray(item.stores) || item.stores.length === 0) item.stores = ["PDD","SKH"];

    // Category rule: Unopened chiller always MANUAL
    if (item.category === "Unopened chiller") {
      item.expiryMode = MODE.MANUAL;
      item.expiryHours = null;
      item.eodTime = null;
      item.helperText = "Select expiry manually.";
      return item;
    }

    // Chicken Bacon => EOD (23:59)
    if (lname === "chicken bacon") {
      item.expiryMode = MODE.EOD;
      item.eodTime = "23:59";
      item.expiryHours = null;
      item.helperText = "Expires end of day.";
      return item;
    }

    // Hourly fixed items (dropdown slots)
    if (lname === "bread" || lname === "tomato soup (h)" || lname === "mushroom soup (h)") {
      item.expiryMode = MODE.HOURLY_FIXED;
      item.expiryHours = null;
      item.eodTime = null;
      item.helperText = "Select expiry slot: 11am / 3pm / 7pm / 11pm.";
      return item;
    }

    // Cajun spice open inner => AUTO 5 days (case-insensitive contains)
    if (lname.includes("cajun spice") && lname.includes("open inner")) {
      item.expiryMode = MODE.AUTO;
      item.expiryHours = 5 * 24;
      item.eodTime = null;
      item.helperText = "Auto expiry: 5 days.";
      return item;
    }

    // Cajun spice packet (not open inner) => MANUAL
    if (lname.includes("cajun spice") && !lname.includes("open inner")) {
      item.expiryMode = MODE.MANUAL;
      item.expiryHours = null;
      item.eodTime = null;
      item.helperText = "Select expiry manually.";
      return item;
    }

    // Manual items (general) — matches by contains
    const manualMatchers = [
      (n)=> n === "salt",
      (n)=> n === "pepper",
      (n)=> n === "cookies",
      (n)=> n === "olive oil",
      (n)=> n === "milo",
      (n)=> n === "tea bag",
      (n)=> n.includes("canola oil"),
      (n)=> n.includes("salt") && n.includes("open inner"),
      (n)=> n.includes("pepper") && n.includes("open inner"),
      (n)=> n.includes("olive") && n.includes("open bottle"),
    ];
    if (manualMatchers.some(fn => fn(lname))) {
      item.expiryMode = MODE.MANUAL;
      item.expiryHours = null;
      item.eodTime = null;
      item.helperText = "Select expiry manually.";
      return item;
    }

    // Vegetables => AUTO (mix green 1 day, others 2 days)
    if (item.category === "Vegetables") {
      const days = lname.includes("mix green") ? 1 : 2;
      item.expiryMode = MODE.AUTO;
      item.expiryHours = days * 24;
      item.eodTime = null;
      item.helperText = `Auto expiry: ${days} day(s).`;
      return item;
    }

    // shelf life rule: > 7 days => MANUAL, else AUTO
    const d = Number(item.shelf_life_days);
    if (Number.isFinite(d) && d > 7) {
      item.expiryMode = MODE.MANUAL;
      item.expiryHours = null;
      item.eodTime = null;
      item.helperText = "Shelf life > 7 days: select expiry manually.";
      return item;
    }
    if (Number.isFinite(d)) {
      item.expiryMode = MODE.AUTO;
      item.expiryHours = Math.round(d * 24);
      item.eodTime = null;
      item.helperText = `Auto expiry: ${d} day(s).`;
      return item;
    }

    // If no shelf life: manual
    item.expiryMode = MODE.MANUAL;
    item.expiryHours = null;
    item.eodTime = null;
    item.helperText = "Select expiry manually.";
    return item;
  }

  function ensureMustHave(items) {
    const names = new Set(items.map(i => String(i.name).toLowerCase()));

    // Add Unopened chiller items (manual)
    for (const nm of ["Ceddar Cheese","Tuna packet","Milk","Corn"]) {
      if (!names.has(nm.toLowerCase())) {
        items.push(applyRules({
          id: "added-" + nm.toLowerCase().replace(/\s+/g,"-"),
          name: nm,
          category: "Unopened chiller",
          sub_category: "",
          shelf_life_days: null,
          stores: ["PDD","SKH"],
        }));
        names.add(nm.toLowerCase());
      }
    }

    // Ensure veg packets exist under Vegetables
    for (const nm of ["Mix green packet","Onion packet","Lettuce packet"]) {
      if (!names.has(nm.toLowerCase())) {
        items.push(applyRules({
          id: "added-" + nm.toLowerCase().replace(/\s+/g,"-"),
          name: nm,
          category: "Vegetables",
          sub_category: "",
          shelf_life_days: null,
          stores: ["PDD","SKH"],
        }));
        names.add(nm.toLowerCase());
      }
    }

    // SKH-only item Beef Taco (H) HOURLY 1h
    if (!names.has("beef taco (h)")) {
      const taco = {
        id: "skh-beef-taco-h",
        name: "Beef Taco (H)",
        category: "Front counter",
        sub_category: "",
        shelf_life_days: null,
        stores: ["SKH"],
        expiryMode: MODE.HOURLY,
        expiryHours: 1,
        helperText: "Hourly item – expires after 1 hour (SKH only).",
        eodTime: null,
      };
      items.push(taco);
      names.add("beef taco (h)");
    }

    return items;
  }

  function seedIfNeeded() {
    const existing = lsGet(LS.ITEMS, null);
    if (Array.isArray(existing) && existing.length > 0) return;

    let items = EMBEDDED_ITEMS.map(r => applyRules(r));
    items = ensureMustHave(items);

    lsSet(LS.ITEMS, items);

    if (!localStorage.getItem(LS.MGR_PIN)) localStorage.setItem(LS.MGR_PIN, "1234");
  }

  function getItems() { return lsGet(LS.ITEMS, []); }
  function setItems(items) { lsSet(LS.ITEMS, items); }

  function getLogs() { return lsGet(LS.LOGS, []); }
  function setLogs(logs) { lsSet(LS.LOGS, logs); }

  function getItemById(id) {
    return getItems().find(i => i.id === id);
  }

  function itemsForCurrentList() {
    const items = getItems();
    const storeItems = items.filter(i => Array.isArray(i.stores) && i.stores.includes(state.store));
    if (state.selectedCategory === "Sauce") {
      return storeItems.filter(i => i.category === "Sauce" && (i.sub_category || "") === (state.selectedSauceSub || ""));
    }
    return storeItems.filter(i => i.category === state.selectedCategory);
  }

  // ---- Expiry computation
  function toSameDayTime(base, hhmm) {
    const parts = String(hhmm || "").split(":");
    if (parts.length !== 2) return null;
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
    const d = new Date(base);
    d.setHours(h, m, 0, 0);
    return d;
  }

  function addHours(date, hours) {
    const h = Number(hours);
    if (!Number.isFinite(h)) return null;
    return new Date(date.getTime() + h*3600*1000);
  }

  function computeExpiry(item) {
    const n = now();

    if (item.expiryMode === MODE.MANUAL) {
      const d = parseDTLocal(state.manualExpiry);
      if (!d) return { expiryAt: null, error: "Manual expiry date/time is required." };
      return { expiryAt: d, error: null };
    }

    if (item.expiryMode === MODE.EOD) {
      const e = toSameDayTime(n, item.eodTime || "23:59");
      if (!e) return { expiryAt: null, error: "Invalid EOD time." };
      // if now passed, set to tomorrow
      if (n.getTime() > e.getTime()) {
        const t = new Date(n);
        t.setDate(t.getDate()+1);
        const e2 = toSameDayTime(t, item.eodTime || "23:59");
        return { expiryAt: e2, error: null };
      }
      return { expiryAt: e, error: null };
    }

    if (item.expiryMode === MODE.HOURLY_FIXED) {
      if (!state.hourlySlot) return { expiryAt: null, error: "Please select a time slot." };
      // allowed even if passed
      const s = toSameDayTime(n, state.hourlySlot);
      if (!s) return { expiryAt: null, error: "Invalid time slot." };
      return { expiryAt: s, error: null };
    }

    if (item.expiryMode === MODE.HOURLY) {
      const d = addHours(n, item.expiryHours ?? 1);
      if (!d) return { expiryAt: null, error: "Hourly expiry hours missing." };
      return { expiryAt: d, error: null };
    }

    if (item.expiryMode === MODE.AUTO) {
      const d = addHours(n, item.expiryHours);
      if (!d) return { expiryAt: null, error: "Auto expiry hours missing." };
      return { expiryAt: d, error: null };
    }

    return { expiryAt: null, error: "Unknown expiry mode." };
  }

  // ---- UI Rendering
  function renderNav() {
    const nav = $("nav");
    const parts = [];

    parts.push(navBtn("Home", "HOME"));
    parts.push(navBtn("History / Records", "HISTORY"));

    if (state.managerAuthed) {
      parts.push(`<div class="divider"></div>`);
      parts.push(`<div class="muted" style="font-weight:900;">Manager</div>`);
      parts.push(navBtn("Expiring", "EXPIRING"));
      parts.push(navBtn("Add Item", "MGR_ADD"));
    }

    nav.innerHTML = `<div class="list">${parts.join("")}</div>`;
  }

  function navBtn(label, screen) {
    const active = state.screen === screen ? "active" : "";
    return `
      <div class="pill ${active}" onclick="App.go('${screen}')">
        <div style="font-weight:900;">${esc(label)}</div>
        <div class="muted">Tap to open</div>
      </div>
    `;
  }

  function renderTopBar() {
    $("storeSelect").value = state.store;
    $("staffLabel").textContent = state.staff ? state.staff : "Not set";

    if (state.managerAuthed) {
      $("mgrBtn").style.display = "none";
      $("mgrLogoutBtn").style.display = "inline-block";
    } else {
      $("mgrBtn").style.display = "inline-block";
      $("mgrLogoutBtn").style.display = "none";
    }
  }

  function render() {
    renderNav();
    renderTopBar();

    const screen = $("screen");
    if (state.screen === "HOME") {
      screen.innerHTML = renderHome();
      wireHome();
      return;
    }

    if (state.screen === "ITEMS") {
      screen.innerHTML = renderItems();
      wireItems();
      return;
    }

    if (state.screen === "SAUCE_SUBS") {
      screen.innerHTML = renderSauceSubs();
      wireSauceSubs();
      return;
    }

    if (state.screen === "SAUCE_ITEMS") {
      screen.innerHTML = renderSauceItems();
      wireSauceItems();
      return;
    }

    if (state.screen === "RECORD") {
      screen.innerHTML = renderRecord();
      wireRecord();
      return;
    }

    if (state.screen === "HISTORY") {
      screen.innerHTML = renderHistory();
      wireHistory();
      return;
    }

    if (state.screen === "EXPIRING") {
      screen.innerHTML = renderExpiring();
      return;
    }

    if (state.screen === "MGR_ADD") {
      screen.innerHTML = renderMgrAdd();
      wireMgrAdd();
      return;
    }

    screen.innerHTML = `<div class="muted">Unknown screen.</div>`;
  }

  function renderHome() {
    return `
      <div class="muted">Store: <span class="kbd">${esc(state.store)}</span></div>
      <div class="divider"></div>
      <h3>Categories</h3>
      <div class="list">
        ${CATEGORIES.map(c => `
          <div class="pill" data-cat="${esc(c)}">
            <div style="font-weight:900;">${esc(c)}</div>
            <div class="muted">Tap to open</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function wireHome() {
    $("screen").querySelectorAll("[data-cat]").forEach(el => {
      el.onclick = () => {
        const cat = el.getAttribute("data-cat");
        state.selectedCategory = cat;
        state.selectedItemId = null;
        state.selectedSauceSub = null;

        if (cat === "Sauce") state.screen = "SAUCE_SUBS";
        else state.screen = "ITEMS";

        render();
      };
    });
  }

  function renderItems() {
    const items = itemsForCurrentList();
    return `
      <div class="row">
        <button onclick="App.go('HOME')">← Back</button>
        <div class="muted">Category: <span class="kbd">${esc(state.selectedCategory || "")}</span></div>
      </div>
      <div class="divider"></div>
      ${items.length === 0 ? `<div class="muted">No items for this store.</div>` : `
        <div class="list">
          ${items.map(i => `
            <div class="pill" data-item="${esc(i.id)}">
              <div style="font-weight:900;">
                ${esc(i.name)}
                <span class="badge">${esc(i.expiryMode)}</span>
                ${(i.stores?.length===1 && i.stores[0]==="SKH") ? `<span class="badge">SKH-only</span>` : ""}
              </div>
              <div class="muted">${esc(i.helperText || "")}</div>
            </div>
          `).join("")}
        </div>
      `}
    `;
  }

  function wireItems() {
    $("screen").querySelectorAll("[data-item]").forEach(el => {
      el.onclick = () => {
        state.selectedItemId = el.getAttribute("data-item");
        openRecord();
      };
    });
  }

  function renderSauceSubs() {
    return `
      <div class="row">
        <button onclick="App.go('HOME')">← Back</button>
        <div class="muted">Sauce sub-categories</div>
      </div>
      <div class="divider"></div>
      <div class="list">
        ${SAUCE_SUBS.map(s => `
          <div class="pill" data-sub="${esc(s)}">
            <div style="font-weight:900;">${esc(s)}</div>
            <div class="muted">Tap to open</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function wireSauceSubs() {
    $("screen").querySelectorAll("[data-sub]").forEach(el => {
      el.onclick = () => {
        state.selectedSauceSub = el.getAttribute("data-sub");
        state.screen = "SAUCE_ITEMS";
        render();
      };
    });
  }

  function renderSauceItems() {
    const items = itemsForCurrentList();
    return `
      <div class="row">
        <button onclick="App.go('SAUCE_SUBS')">← Back</button>
        <div class="muted">Sauce → <span class="kbd">${esc(state.selectedSauceSub || "")}</span></div>
      </div>
      <div class="divider"></div>
      ${items.length === 0 ? `<div class="muted">No sauce items here.</div>` : `
        <div class="list">
          ${items.map(i => `
            <div class="pill" data-item="${esc(i.id)}">
              <div style="font-weight:900;">
                ${esc(i.name)} <span class="badge">${esc(i.expiryMode)}</span>
              </div>
              <div class="muted">${esc(i.helperText || "")}</div>
            </div>
          `).join("")}
        </div>
      `}
    `;
  }

  function wireSauceItems() {
    $("screen").querySelectorAll("[data-item]").forEach(el => {
      el.onclick = () => {
        state.selectedItemId = el.getAttribute("data-item");
        openRecord();
      };
    });
  }

  function openRecord() {
    state.error = "";
    state.qty = "";
    state.manualExpiry = toDTLocalValue(now());
    state.hourlySlot = "";
    state.screen = "RECORD";
    render();
  }

  function backFromRecord() {
    const item = getItemById(state.selectedItemId);
    if (!item) return go("HOME");
    if (item.category === "Sauce") return go("SAUCE_ITEMS");
    return go("ITEMS");
  }

  function renderRecord() {
    const item = getItemById(state.selectedItemId);
    if (!item) return `<div class="muted">Item not found.</div>`;

    const computed = computeExpiry(item);

    const showManual = item.expiryMode === MODE.MANUAL;
    const showFixed = item.expiryMode === MODE.HOURLY_FIXED;

    const slotOpts = HOURLY_SLOTS.map(s => `<option value="${esc(s.value)}" ${state.hourlySlot===s.value ? "selected" : ""}>${esc(s.label)}</option>`).join("");

    return `
      <div class="row">
        <button onclick="App.backFromRecord()">← Back</button>
        <div class="muted">
          Store: <span class="kbd">${esc(state.store)}</span>
          • Category: <span class="kbd">${esc(item.category)}</span>
          ${item.category==="Sauce" ? `• Sauce: <span class="kbd">${esc(item.sub_category || "")}</span>` : ""}
        </div>
      </div>

      <div class="divider"></div>

      <div style="font-weight:900; font-size:16px;">
        ${esc(item.name)} <span class="badge">${esc(item.expiryMode)}</span>
      </div>
      <div class="small">${esc(item.helperText || "")}</div>

      <div class="divider"></div>

      <div class="row" style="align-items:flex-start;">
        <div style="flex:1; min-width:220px;">
          <div class="muted" style="font-weight:900; margin-bottom:6px;">Quantity (0 allowed)</div>
          <input id="qtyInput" type="number" step="1" value="${esc(state.qty)}" placeholder="Example: 1 (or 0)" />
        </div>

        ${showManual ? `
          <div style="flex:1; min-width:240px;">
            <div class="muted" style="font-weight:900; margin-bottom:6px;">Manual Expiry (required)</div>
            <input id="manualExpiryInput" type="datetime-local" value="${esc(state.manualExpiry)}" />
          </div>
        ` : ""}

        ${showFixed ? `
          <div style="flex:1; min-width:240px;">
            <div class="muted" style="font-weight:900; margin-bottom:6px;">Expiry Slot</div>
            <select id="hourlySlotSelect">
              <option value="">Select time</option>
              ${slotOpts}
            </select>
            <div class="small">Allowed even if time already passed.</div>
          </div>
        ` : ""}
      </div>

      <div class="divider"></div>

      ${state.error ? `<div class="error">${esc(state.error)}</div><div class="divider"></div>` : ""}

      <div class="okbox">
        ${computed.error
          ? `<div class="error">${esc(computed.error)}</div>`
          : `<div><b>Computed Expiry At:</b> ${esc(computed.expiryAt.toLocaleString())}</div>`
        }
      </div>

      <div class="divider"></div>

      <div class="row">
        <button class="primary" onclick="App.trySave()">Save</button>
        <button onclick="App.go('HOME')">Home</button>
      </div>
    `;
  }

  function wireRecord() {
    const q = $("qtyInput");
    if (q) q.oninput = (e) => state.qty = e.target.value;

    const m = $("manualExpiryInput");
    if (m) m.oninput = (e) => state.manualExpiry = e.target.value;

    const s = $("hourlySlotSelect");
    if (s) s.onchange = (e) => state.hourlySlot = e.target.value;
  }

  // ---- Confirm modal
  function openConfirm() {
    $("confirmModal").style.display = "flex";
  }

  function closeConfirm() {
    $("confirmModal").style.display = "none";
  }

  function trySave() {
    const item = getItemById(state.selectedItemId);
    if (!item) return;

    state.error = "";

    // Validation: quantity is NOT required and 0 is allowed -> no blocking
    if (item.expiryMode === MODE.MANUAL) {
      const d = parseDTLocal(state.manualExpiry);
      if (!d) { state.error = "Manual expiry date/time is required."; render(); return; }
    }

    if (item.expiryMode === MODE.HOURLY_FIXED) {
      if (!state.hourlySlot) { state.error = "Please select a time slot."; render(); return; }
      // allowed even if passed
    }

    const computed = computeExpiry(item);
    if (computed.error) { state.error = computed.error; render(); return; }

    state.pendingSave = {
      itemId: item.id,
      expiryAtISO: computed.expiryAt.toISOString(),
      qty: (state.qty === "" ? null : Number(state.qty)), // can be 0
    };

    openConfirm();
  }

  function confirmSave() {
    if (!state.pendingSave) return;

    const item = getItemById(state.pendingSave.itemId);
    if (!item) return;

    const logs = getLogs();
    logs.unshift({
      id: "log-" + Math.random().toString(16).slice(2),
      createdAtISO: new Date().toISOString(),
      store: state.store,
      staff: state.staff || "Unknown",
      category: item.category,
      sauceSubcategory: item.category === "Sauce" ? (item.sub_category || "") : "",
      itemName: item.name,
      expiryMode: item.expiryMode,
      expiryAtISO: state.pendingSave.expiryAtISO,
      qty: state.pendingSave.qty,
    });
    setLogs(logs);

    closeConfirm();
    state.pendingSave = null;

    alert("Saved ✅");
    go("HOME");
  }

  // ---- History
  function renderHistory() {
    const logs = getLogs();

    const storeOpts = ["ALL","PDD","SKH"].map(s => `<option value="${s}" ${state.historyStore===s?"selected":""}>${s}</option>`).join("");
    const dateOpts = ["TODAY","YESTERDAY","ALL"].map(d => `<option value="${d}" ${state.historyDate===d?"selected":""}>${d}</option>`).join("");
    const catOpts = ["ALL", ...CATEGORIES].map(c => `<option value="${esc(c)}" ${state.historyCategory===c?"selected":""}>${esc(c)}</option>`).join("");

    const filtered = logs.filter(l => {
      if (state.historyStore !== "ALL" && l.store !== state.historyStore) return false;
      if (state.historyCategory !== "ALL" && l.category !== state.historyCategory) return false;

      if (state.historyDate === "ALL") return true;

      const created = new Date(l.createdAtISO);
      const today = new Date();
      const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const startYesterday = new Date(startToday);
      startYesterday.setDate(startYesterday.getDate()-1);

      if (state.historyDate === "TODAY") return created >= startToday;
      if (state.historyDate === "YESTERDAY") return created >= startYesterday && created < startToday;

      return true;
    });

    return `
      <div class="row" style="justify-content:space-between;">
        <div class="muted">History / Records</div>
        <button onclick="App.go('HOME')">Home</button>
      </div>

      <div class="divider"></div>

      <div class="row">
        <div>
          <div class="muted" style="font-weight:900; margin-bottom:6px;">Store</div>
          <select id="histStore">${storeOpts}</select>
        </div>
        <div>
          <div class="muted" style="font-weight:900; margin-bottom:6px;">Date</div>
          <select id="histDate">${dateOpts}</select>
        </div>
        <div style="flex:1; min-width:220px;">
          <div class="muted" style="font-weight:900; margin-bottom:6px;">Category</div>
          <select id="histCat" style="width:100%">${catOpts}</select>
        </div>
      </div>

      <div class="divider"></div>

      ${filtered.length === 0 ? `<div class="muted">No records found.</div>` : `
        <div class="list">
          ${filtered.slice(0,300).map(l => `
            <div class="pill">
              <div style="font-weight:900;">
                ${esc(l.itemName)}
                <span class="badge">${esc(l.store)}</span>
                <span class="badge">${esc(l.category)}</span>
                ${l.sauceSubcategory ? `<span class="badge">${esc(l.sauceSubcategory)}</span>` : ""}
              </div>
              <div class="muted">
                Saved: ${esc(new Date(l.createdAtISO).toLocaleString())}
                • Expiry: ${esc(new Date(l.expiryAtISO).toLocaleString())}
                • Qty: <span class="kbd">${esc(l.qty ?? "")}</span>
                • Staff: <span class="kbd">${esc(l.staff)}</span>
              </div>
            </div>
          `).join("")}
        </div>
      `}
      ${state.managerAuthed ? `<div class="divider"></div><button onclick="App.exportLogsCSV()">Export Logs (CSV)</button>` : ""}
    `;
  }

  function wireHistory() {
    const a = $("histStore");
    const b = $("histDate");
    const c = $("histCat");
    if (a) a.onchange = (e) => { state.historyStore = e.target.value; render(); };
    if (b) b.onchange = (e) => { state.historyDate = e.target.value; render(); };
    if (c) c.onchange = (e) => { state.historyCategory = e.target.value; render(); };
  }

  function exportLogsCSV() {
    const logs = getLogs();
    const cols = ["createdAtISO","store","staff","category","sauceSubcategory","itemName","expiryMode","expiryAtISO","qty"];
    const lines = [cols.join(",")];
    for (const l of logs) {
      lines.push(cols.map(k => {
        const v = (l[k] == null) ? "" : String(l[k]);
        return `"${v.replaceAll('"','""')}"`;
      }).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type:"text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `precheck_logs_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---- Expiring (manager)
  function renderExpiring() {
    if (!state.managerAuthed) return `<div class="muted">Manager access required.</div>`;

    const logs = getLogs().filter(l => l.store === state.expiringTab);
    const nowMs = Date.now();

    const list = logs.map(l => {
      const expMs = new Date(l.expiryAtISO).getTime();
      return { ...l, expMs, leftMs: expMs - nowMs };
    });

    const expired = list.filter(x => x.leftMs < 0).sort((a,b)=>a.expMs-b.expMs);
    const soon = list.filter(x => x.leftMs >= 0 && x.leftMs <= 4*3600*1000).sort((a,b)=>a.expMs-b.expMs);
    const later = list.filter(x => x.leftMs > 4*3600*1000).sort((a,b)=>a.expMs-b.expMs);

    function group(title, arr) {
      return `
        <div class="divider"></div>
        <div style="font-weight:900;">${esc(title)} <span class="badge">${arr.length}</span></div>
        ${arr.length===0 ? `<div class="muted">None</div>` : `
          <div class="list" style="margin-top:8px;">
            ${arr.slice(0,200).map(x => `
              <div class="pill">
                <div style="font-weight:900;">
                  ${esc(x.itemName)}
                  <span class="badge">${esc(x.category)}</span>
                  ${x.sauceSubcategory ? `<span class="badge">${esc(x.sauceSubcategory)}</span>` : ""}
                </div>
                <div class="muted">
                  Expiry: ${esc(new Date(x.expiryAtISO).toLocaleString())}
                  • Qty: <span class="kbd">${esc(x.qty ?? "")}</span>
                  • Staff: <span class="kbd">${esc(x.staff)}</span>
                </div>
              </div>
            `).join("")}
          </div>
        `}
      `;
    }

    return `
      <div class="row" style="justify-content:space-between;">
        <div class="muted">Expiring (Manager)</div>
        <button onclick="App.go('HOME')">Home</button>
      </div>

      <div class="divider"></div>

      <div class="tabs">
        <div class="tab ${state.expiringTab==="PDD"?"active":""}" onclick="App.setExpiringTab('PDD')">PDD</div>
        <div class="tab ${state.expiringTab==="SKH"?"active":""}" onclick="App.setExpiringTab('SKH')">SKH</div>
      </div>

      ${group("Expired", expired)}
      ${group("Expiring soon (next 4 hours)", soon)}
      ${group("Later", later)}
    `;
  }

  function setExpiringTab(tab) {
    state.expiringTab = tab;
    render();
  }

  // ---- Manager add item (in-app)
  function renderMgrAdd() {
    if (!state.managerAuthed) return `<div class="muted">Manager access required.</div>`;

    const catOpts = CATEGORIES.map(c => `<option value="${esc(c)}" ${state.mgrCategory===c?"selected":""}>${esc(c)}</option>`).join("");
    const storeOpts = ["PDD,SKH","PDD","SKH"].map(s => `<option value="${s}" ${state.mgrStores===s?"selected":""}>${s}</option>`).join("");
    const sauceSubVisible = state.mgrCategory === "Sauce";
    const sauceSubOpts = SAUCE_SUBS.map(s => `<option value="${esc(s)}" ${state.mgrSauceSub===s?"selected":""}>${esc(s)}</option>`).join("");

    return `
      <div class="row" style="justify-content:space-between;">
        <div class="muted">Add Item (Manager)</div>
        <button onclick="App.go('HOME')">Home</button>
      </div>

      <div class="divider"></div>
      ${state.mgrError ? `<div class="error">${esc(state.mgrError)}</div><div class="divider"></div>` : ""}

      <div class="row" style="align-items:flex-start;">
        <div style="flex:1; min-width:220px;">
          <div class="muted" style="font-weight:900; margin-bottom:6px;">Item Name</div>
          <input id="mgrName" type="text" value="${esc(state.mgrName)}" style="width:100%;" />
        </div>

        <div style="min-width:220px;">
          <div class="muted" style="font-weight:900; margin-bottom:6px;">Category</div>
          <select id="mgrCat">${catOpts}</select>
        </div>

        <div style="min-width:220px;">
          <div class="muted" style="font-weight:900; margin-bottom:6px;">Shelf Life (days)</div>
          <input id="mgrDays" type="number" step="1" value="${esc(state.mgrShelfDays)}" />
          <div class="small">If > 7 days → MANUAL</div>
        </div>

        <div style="min-width:200px;">
          <div class="muted" style="font-weight:900; margin-bottom:6px;">Store</div>
          <select id="mgrStore">${storeOpts}</select>
        </div>

        ${sauceSubVisible ? `
          <div style="min-width:220px;">
            <div class="muted" style="font-weight:900; margin-bottom:6px;">Sauce Sub-category</div>
            <select id="mgrSauceSub">${sauceSubOpts}</select>
          </div>
        ` : ""}
      </div>

      <div class="divider"></div>
      <div class="row">
        <button class="primary" onclick="App.managerAddItem()">Add Item</button>
        <button onclick="App.resetMgrForm()">Reset</button>
      </div>
    `;
  }

  function wireMgrAdd() {
    const a = $("mgrName");
    const b = $("mgrCat");
    const c = $("mgrDays");
    const d = $("mgrStore");
    const e = $("mgrSauceSub");

    if (a) a.oninput = (ev) => state.mgrName = ev.target.value;
    if (b) b.onchange = (ev) => { state.mgrCategory = ev.target.value; render(); };
    if (c) c.oninput = (ev) => state.mgrShelfDays = ev.target.value;
    if (d) d.onchange = (ev) => state.mgrStores = ev.target.value;
    if (e) e.onchange = (ev) => state.mgrSauceSub = ev.target.value;
  }

  function resetMgrForm() {
    state.mgrName = "";
    state.mgrCategory = "Prepared items";
    state.mgrShelfDays = "";
    state.mgrStores = "PDD,SKH";
    state.mgrSauceSub = "Standby";
    state.mgrError = "";
    render();
  }

  function managerAddItem() {
    state.mgrError = "";
    const name = normalizeName(state.mgrName);
    const category = normalizeCategory(state.mgrCategory);
    const days = Number(state.mgrShelfDays);

    if (!name) { state.mgrError = "Item name is required."; render(); return; }
    if (!Number.isFinite(days) || days <= 0) { state.mgrError = "Shelf life days must be > 0."; render(); return; }

    const stores = state.mgrStores.split(",").map(s=>s.trim()).filter(Boolean);
    const sub = (category === "Sauce") ? (state.mgrSauceSub || "Standby") : "";

    // Build raw
    const raw = {
      id: "mgr-" + Math.random().toString(16).slice(2),
      name,
      category,
      sub_category: sub,
      shelf_life_days: days,
      stores: stores.length ? stores : ["PDD","SKH"],
    };

    // Apply all rules
    const item = applyRules(raw);

    const items = getItems();
    items.unshift(item);
    setItems(items);

    alert("Item added ✅");
    resetMgrForm();
  }

  // ---- Staff modal
  function openStaff() {
    $("staffInput").value = state.staff || "";
    $("staffModal").style.display = "flex";
  }
  function closeStaff() {
    $("staffModal").style.display = "none";
  }
  function saveStaff() {
    const v = String($("staffInput").value || "").trim();
    state.staff = v;
    lsSet(LS.STAFF, v);
    closeStaff();
    renderTopBar();
  }

  // ---- Manager auth
  function openManagerLogin() {
    $("mgrPinInput").value = "";
    $("mgrModal").style.display = "flex";
  }
  function closeManagerLogin() {
    $("mgrModal").style.display = "none";
  }
  function managerLogin() {
    const pin = String($("mgrPinInput").value || "");
    const real = localStorage.getItem(LS.MGR_PIN) || "1234";
    if (pin !== real) { alert("Wrong PIN"); return; }
    state.managerAuthed = true;
    lsSet(LS.MGR_AUTH, true);
    closeManagerLogin();
    render();
  }
  function managerLogout() {
    state.managerAuthed = false;
    lsSet(LS.MGR_AUTH, false);
    go("HOME");
  }

  // ---- Confirmation modal bindings
  function wireModals() {
    // confirm modal is in HTML
  }

  // ---- Navigation
  function go(screen) {
    state.screen = screen;

    if (screen === "HOME") {
      state.selectedCategory = null;
      state.selectedSauceSub = null;
      state.selectedItemId = null;
      state.error = "";
    }

    render();
  }

  // ---- Init
  function init() {
    seedIfNeeded();

    state.store = lsGet(LS.STORE, "PDD");
    state.staff = lsGet(LS.STAFF, "");
    state.managerAuthed = !!lsGet(LS.MGR_AUTH, false);

    $("storeSelect").onchange = (e) => {
      state.store = e.target.value;
      lsSet(LS.STORE, state.store);
      go("HOME");
    };

    render();
    if (!state.staff) openStaff();
  }

  // ---- public API
  return {
    init,

    go,
    backFromRecord,
    trySave,
    closeConfirm,
    confirmSave,

    openStaff,
    closeStaff,
    saveStaff,

    openManagerLogin,
    closeManagerLogin,
    managerLogin,
    managerLogout,

    setExpiringTab,
    exportLogsCSV,

    managerAddItem,
    resetMgrForm,
  };
})();

window.App = App;
window.addEventListener("DOMContentLoaded", () => App.init());
