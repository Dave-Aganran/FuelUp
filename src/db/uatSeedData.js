const organizations = [
  { name: "MRS Oil Nigeria Plc", contact_email: "uat.ops@mrs.example" },
  { name: "Northstar Energy Services", contact_email: "ops@northstar.example" },
  { name: "Lagos Prime Fuels", contact_email: "support@lagosprime.example" },
  { name: "Mainland Fleet Energy", contact_email: "fleet@mainlandenergy.example" },
  { name: "Atlantic Gas and Lubes", contact_email: "trade@atlanticgas.example" }
];

const outlets = [
  {
    organization_name: "MRS Oil Nigeria Plc",
    name: "MRS Lekki Admiralty",
    city: "Lagos",
    address: "Admiralty Way, Lekki Phase 1",
    phone: "+234 800 310 1001",
    is_open: true
  },
  {
    organization_name: "MRS Oil Nigeria Plc",
    name: "MRS Victoria Island",
    city: "Lagos",
    address: "Ahmadu Bello Way, Victoria Island",
    phone: "+234 800 310 1002",
    is_open: true
  },
  {
    organization_name: "MRS Oil Nigeria Plc",
    name: "MRS Ikeja Central",
    city: "Lagos",
    address: "Obafemi Awolowo Way, Ikeja",
    phone: "+234 800 310 1003",
    is_open: true
  },
  {
    organization_name: "Northstar Energy Services",
    name: "Northstar Lekki Phase 1",
    city: "Lagos",
    address: "Admiralty Road, Lekki Phase 1",
    phone: "+234 800 100 1001",
    is_open: true
  },
  {
    organization_name: "Northstar Energy Services",
    name: "Northstar Victoria Island",
    city: "Lagos",
    address: "Ozumba Mbadiwe Avenue, VI",
    phone: "+234 800 100 1002",
    is_open: true
  },
  {
    organization_name: "Lagos Prime Fuels",
    name: "Lagos Prime Ikeja",
    city: "Lagos",
    address: "Allen Avenue, Ikeja",
    phone: "+234 800 200 2001",
    is_open: true
  },
  {
    organization_name: "Lagos Prime Fuels",
    name: "Lagos Prime Apapa Depot",
    city: "Lagos",
    address: "Creek Road, Apapa",
    phone: "+234 800 200 2002",
    is_open: true
  },
  {
    organization_name: "Mainland Fleet Energy",
    name: "Mainland Yaba Fleet Hub",
    city: "Lagos",
    address: "Herbert Macaulay Way, Yaba",
    phone: "+234 800 400 4001",
    is_open: true
  },
  {
    organization_name: "Mainland Fleet Energy",
    name: "Mainland Ogba Commercial",
    city: "Lagos",
    address: "Lateef Jakande Road, Ogba",
    phone: "+234 800 400 4002",
    is_open: true
  },
  {
    organization_name: "Atlantic Gas and Lubes",
    name: "Atlantic Ajah Gas Hub",
    city: "Lagos",
    address: "Lekki-Epe Expressway, Ajah",
    phone: "+234 800 500 5001",
    is_open: true
  }
];

const products = [
  { outlet_name: "MRS Lekki Admiralty", name: "PMS Petrol", unit: "litre", price: 735, available_quantity: 42000, low_stock_threshold: 9000 },
  { outlet_name: "MRS Lekki Admiralty", name: "AGO Diesel", unit: "litre", price: 1180, available_quantity: 26000, low_stock_threshold: 6000 },
  { outlet_name: "MRS Lekki Admiralty", name: "DPK Kerosene", unit: "litre", price: 1020, available_quantity: 8000, low_stock_threshold: 1800 },
  { outlet_name: "MRS Lekki Admiralty", name: "Engine Oil 5W-30", unit: "bottle", price: 9200, available_quantity: 320, low_stock_threshold: 60 },
  { outlet_name: "MRS Victoria Island", name: "PMS Petrol", unit: "litre", price: 738, available_quantity: 39000, low_stock_threshold: 8500 },
  { outlet_name: "MRS Victoria Island", name: "AGO Diesel", unit: "litre", price: 1190, available_quantity: 31000, low_stock_threshold: 7000 },
  { outlet_name: "MRS Victoria Island", name: "LPG Cooking Gas", unit: "kg", price: 1280, available_quantity: 5200, low_stock_threshold: 1200 },
  { outlet_name: "MRS Ikeja Central", name: "PMS Petrol", unit: "litre", price: 730, available_quantity: 46000, low_stock_threshold: 10000 },
  { outlet_name: "MRS Ikeja Central", name: "AGO Diesel", unit: "litre", price: 1175, available_quantity: 24000, low_stock_threshold: 5000 },
  { outlet_name: "MRS Ikeja Central", name: "ATF Transmission Fluid", unit: "bottle", price: 7800, available_quantity: 210, low_stock_threshold: 40 },
  { outlet_name: "Northstar Lekki Phase 1", name: "PMS Petrol", unit: "litre", price: 720, available_quantity: 18000, low_stock_threshold: 3500 },
  { outlet_name: "Northstar Lekki Phase 1", name: "AGO Diesel", unit: "litre", price: 1120, available_quantity: 9000, low_stock_threshold: 2000 },
  { outlet_name: "Northstar Lekki Phase 1", name: "LPG Cooking Gas", unit: "kg", price: 1245, available_quantity: 2200, low_stock_threshold: 500 },
  { outlet_name: "Northstar Victoria Island", name: "PMS Petrol", unit: "litre", price: 725, available_quantity: 12000, low_stock_threshold: 2800 },
  { outlet_name: "Northstar Victoria Island", name: "AGO Diesel", unit: "litre", price: 1135, available_quantity: 14500, low_stock_threshold: 3200 },
  { outlet_name: "Lagos Prime Ikeja", name: "PMS Petrol", unit: "litre", price: 728, available_quantity: 22000, low_stock_threshold: 4500 },
  { outlet_name: "Lagos Prime Ikeja", name: "AGO Diesel", unit: "litre", price: 1115, available_quantity: 16000, low_stock_threshold: 3400 },
  { outlet_name: "Lagos Prime Ikeja", name: "Engine Oil 5W-30", unit: "bottle", price: 8500, available_quantity: 140, low_stock_threshold: 30 },
  { outlet_name: "Lagos Prime Apapa Depot", name: "AGO Diesel Bulk", unit: "litre", price: 1105, available_quantity: 85000, low_stock_threshold: 15000 },
  { outlet_name: "Lagos Prime Apapa Depot", name: "Industrial Lubricant ISO 68", unit: "drum", price: 185000, available_quantity: 48, low_stock_threshold: 10 },
  { outlet_name: "Lagos Prime Apapa Depot", name: "Marine Gas Oil", unit: "litre", price: 1210, available_quantity: 54000, low_stock_threshold: 12000 },
  { outlet_name: "Mainland Yaba Fleet Hub", name: "PMS Petrol", unit: "litre", price: 732, available_quantity: 17000, low_stock_threshold: 3800 },
  { outlet_name: "Mainland Yaba Fleet Hub", name: "AGO Diesel", unit: "litre", price: 1165, available_quantity: 21500, low_stock_threshold: 4800 },
  { outlet_name: "Mainland Yaba Fleet Hub", name: "Coolant Premium", unit: "bottle", price: 4200, available_quantity: 260, low_stock_threshold: 55 },
  { outlet_name: "Mainland Ogba Commercial", name: "PMS Petrol", unit: "litre", price: 729, available_quantity: 28000, low_stock_threshold: 6000 },
  { outlet_name: "Mainland Ogba Commercial", name: "AGO Diesel", unit: "litre", price: 1148, available_quantity: 18500, low_stock_threshold: 4200 },
  { outlet_name: "Mainland Ogba Commercial", name: "Grease EP2", unit: "carton", price: 36000, available_quantity: 74, low_stock_threshold: 15 },
  { outlet_name: "Atlantic Ajah Gas Hub", name: "LPG Cooking Gas", unit: "kg", price: 1265, available_quantity: 9200, low_stock_threshold: 1900 },
  { outlet_name: "Atlantic Ajah Gas Hub", name: "PMS Petrol", unit: "litre", price: 736, available_quantity: 15500, low_stock_threshold: 3000 },
  { outlet_name: "Atlantic Ajah Gas Hub", name: "AGO Diesel", unit: "litre", price: 1185, available_quantity: 12600, low_stock_threshold: 2600 }
];

module.exports = { organizations, outlets, products };
