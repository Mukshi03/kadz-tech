/* ==========================================================
   KADZ Tech — site settings
   Edit this file to fill in your details. Empty values are
   hidden on the site automatically.
   ========================================================== */
window.KADZ = {
  company: "KADZ Tech",
  tagline: "",               // e.g. "Warehousing on demand"

  contact: {
    phone: "",               // e.g. "+966 5X XXX XXXX"
    email: "",               // e.g. "hello@kadztech.com"
    address: ""              // e.g. "Jeddah, Saudi Arabia"
  },

  // Cities shown in the search filters, e.g. ["Jeddah", "Riyadh", "Dammam"]
  cities: [],

  currency: "SAR",

  // Monthly price per pallet position for each storage type.
  // Leave as null to show "Price on request" in the estimator.
  rates: {
    dry: null,
    ambient: null,
    chilled: null,
    frozen: null
  },

  // URL that receives form submissions as JSON (POST).
  // Leave empty until your backend / form service is ready.
  formEndpoint: "",

  /* Warehouse listings. Add one object per warehouse:
     {
       name: "North Industrial Hub",
       city: "Jeddah",
       district: "Industrial City, Phase 3",
       types: ["dry", "chilled"],          // dry | ambient | chilled | frozen
       areaSqm: 4200,
       palletsAvailable: 380,
       minMonths: 1,
       features: ["24/7 CCTV", "Loading docks", "WMS access"]
     }
  */
  warehouses: []
};
