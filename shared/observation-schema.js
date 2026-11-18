const fields = [
  {
    key: "cowId",
    databaseColumn: "cow_id",
    csvHeader: "cow_id",
    kind: "text",
    required: true,
    aliases: ["cowid", "id", "animalid", "rfid"],
  },
  {
    key: "cowName",
    databaseColumn: "cow_name",
    csvHeader: "cow_name",
    kind: "text",
    aliases: ["name", "cowname", "animalname"],
  },
  {
    key: "breed",
    databaseColumn: "breed",
    csvHeader: "breed",
    kind: "text",
    aliases: ["breed"],
  },
  {
    key: "recordedAt",
    databaseColumn: "recorded_at",
    csvHeader: "date",
    kind: "date",
    required: true,
    aliases: ["date", "datetime", "timestamp", "recordedat", "recorddate"],
  },
  {
    key: "dim",
    databaseColumn: "dim",
    csvHeader: "DIM",
    kind: "number",
    required: true,
    aliases: ["dim", "daysinmilk"],
  },
  {
    key: "dmy",
    databaseColumn: "dmy",
    csvHeader: "DMY",
    kind: "number",
    required: true,
    aliases: ["dmy", "dailymilkyield", "milkyield"],
  },
  {
    key: "mf",
    databaseColumn: "mf",
    csvHeader: "MF",
    kind: "number",
    required: true,
    aliases: ["mf", "milkingfrequency", "milkingsperday"],
  },
  {
    key: "fc",
    databaseColumn: "fc",
    csvHeader: "FC",
    kind: "number",
    required: true,
    aliases: ["fc", "fat", "fatcontent", "fatcontentpercent"],
  },
  {
    key: "pc",
    databaseColumn: "pc",
    csvHeader: "PC",
    kind: "number",
    required: true,
    aliases: ["pc", "protein", "proteincontent", "proteincontentpercent"],
  },
  {
    key: "mt",
    databaseColumn: "mt",
    csvHeader: "MT",
    kind: "number",
    aliases: ["mt", "milkingtemperature", "milktemperature"],
  },
  {
    key: "rt",
    databaseColumn: "rt",
    csvHeader: "RT",
    kind: "number",
    aliases: ["rt", "ruminationtime"],
  },
  {
    key: "tmax",
    databaseColumn: "tmax",
    csvHeader: "Tmax",
    kind: "number",
    aliases: ["tmax", "maxtemperature"],
  },
  {
    key: "tmin",
    databaseColumn: "tmin",
    csvHeader: "Tmin",
    kind: "number",
    aliases: ["tmin", "mintemperature"],
  },
  {
    key: "rhmax",
    databaseColumn: "rhmax",
    csvHeader: "RHmax",
    kind: "number",
    aliases: ["rhmax", "maxrelativehumidity"],
  },
  {
    key: "rhmin",
    databaseColumn: "rhmin",
    csvHeader: "RHmin",
    kind: "number",
    aliases: ["rhmin", "minrelativehumidity"],
  },
  {
    key: "vp",
    databaseColumn: "vp",
    csvHeader: "VP",
    kind: "number",
    aliases: ["vp", "vapourpressure", "vaporpressure"],
  },
  {
    key: "vpd",
    databaseColumn: "vpd",
    csvHeader: "VPD",
    kind: "number",
    aliases: ["vpd", "vapourpressuredeficit", "vaporpressuredeficit"],
  },
  {
    key: "thiMax",
    databaseColumn: "thi_max",
    csvHeader: "THImax",
    kind: "number",
    aliases: ["thimax", "thi", "temperaturehumidityindex"],
  },
  {
    key: "thiMin",
    databaseColumn: "thi_min",
    csvHeader: "THImin",
    kind: "number",
    aliases: ["thimin"],
  },
];

export const observationSchema = Object.freeze(
  fields.map((field) =>
    Object.freeze({ ...field, aliases: Object.freeze(field.aliases) }),
  ),
);

export const requiredCsvHeaders = Object.freeze(
  observationSchema
    .filter((field) => field.required)
    .map((field) => field.csvHeader),
);

export const optionalCsvHeaders = Object.freeze(
  observationSchema
    .filter((field) => !field.required)
    .map((field) => field.csvHeader),
);
