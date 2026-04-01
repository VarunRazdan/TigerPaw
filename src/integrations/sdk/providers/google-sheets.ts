/**
 * Google Sheets integration — read, write, and append spreadsheet rows.
 *
 * Shares OAuth2 credentials with existing Google integrations
 * (Gmail, Calendar, Meet) but adds the spreadsheets scope.
 */

import { registerIntegration } from "../registry.js";
import type { AuthContext, IntegrationDefinition } from "../types.js";
import { fetchWithTimeout, readJsonResponse, formatApiError, str } from "./_utils.js";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

async function sheetsRequest(
  auth: AuthContext,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<Record<string, unknown>> {
  const token = await auth.getAccessToken();
  const res = await fetchWithTimeout(`${SHEETS_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(formatApiError("Google Sheets", res.status, text));
  }

  return await readJsonResponse(res);
}

const definition: IntegrationDefinition = {
  id: "google_sheets",
  name: "Google Sheets",
  description: "Read, write, and append rows in Google Sheets spreadsheets",
  icon: "google-sheets",
  category: "productivity",
  auth: {
    type: "oauth2",
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    clientIdEnvVar: "GOOGLE_CLIENT_ID",
    clientSecretEnvVar: "GOOGLE_CLIENT_SECRET",
  },
  rateLimitPerMinute: 60, // Google Sheets API: 60 read requests/min
  actions: [
    {
      name: "google_sheets.read_rows",
      displayName: "Read Rows",
      description: "Read rows from a spreadsheet range",
      inputSchema: {
        type: "object",
        properties: {
          spreadsheetId: {
            type: "string",
            description: "Spreadsheet ID (from URL)",
            required: true,
          },
          range: {
            type: "string",
            description: "A1 notation range (e.g. Sheet1!A1:D10)",
            required: true,
          },
          majorDimension: {
            type: "string",
            description: "Major dimension",
            enum: ["ROWS", "COLUMNS"],
            default: "ROWS",
          },
        },
        required: ["spreadsheetId", "range"],
      },
      outputSchema: {
        type: "object",
        properties: {
          range: { type: "string" },
          majorDimension: { type: "string" },
          values: { type: "array", description: "Array of row arrays" },
          rowCount: { type: "number" },
        },
      },
      execute: async (input, auth) => {
        try {
          const id = encodeURIComponent(str(input.spreadsheetId));
          const range = encodeURIComponent(str(input.range));
          const dim = str(input.majorDimension ?? "ROWS");
          const data = await sheetsRequest(auth, `/${id}/values/${range}?majorDimension=${dim}`);
          const values = (data.values ?? []) as unknown[][];
          return {
            range: data.range,
            majorDimension: data.majorDimension,
            values,
            rowCount: values.length,
          };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          throw new Error(`[google_sheets.read_rows] ${e.message}`, { cause: err });
        }
      },
    },
    {
      name: "google_sheets.write_rows",
      displayName: "Write Rows",
      description: "Write rows to a spreadsheet range (overwrites existing data)",
      inputSchema: {
        type: "object",
        properties: {
          spreadsheetId: { type: "string", description: "Spreadsheet ID", required: true },
          range: { type: "string", description: "A1 notation range", required: true },
          values: { type: "array", description: "Array of row arrays (JSON)" },
        },
        required: ["spreadsheetId", "range", "values"],
      },
      outputSchema: {
        type: "object",
        properties: {
          updatedRange: { type: "string" },
          updatedRows: { type: "number" },
          updatedCells: { type: "number" },
        },
      },
      execute: async (input, auth) => {
        try {
          const id = encodeURIComponent(str(input.spreadsheetId));
          const range = encodeURIComponent(str(input.range));
          const values = input.values as unknown[][];
          const data = await sheetsRequest(
            auth,
            `/${id}/values/${range}?valueInputOption=USER_ENTERED`,
            "PUT",
            { values },
          );
          return {
            updatedRange: data.updatedRange,
            updatedRows: data.updatedRows,
            updatedCells: data.updatedCells,
          };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          throw new Error(`[google_sheets.write_rows] ${e.message}`, { cause: err });
        }
      },
    },
    {
      name: "google_sheets.append_row",
      displayName: "Append Row",
      description: "Append a row to the end of a spreadsheet",
      inputSchema: {
        type: "object",
        properties: {
          spreadsheetId: { type: "string", description: "Spreadsheet ID", required: true },
          range: {
            type: "string",
            description: "Sheet name or range (e.g. Sheet1)",
            required: true,
          },
          values: { type: "array", description: "Row values as array (JSON)" },
        },
        required: ["spreadsheetId", "range", "values"],
      },
      outputSchema: {
        type: "object",
        properties: {
          updatedRange: { type: "string" },
          updatedRows: { type: "number" },
        },
      },
      execute: async (input, auth) => {
        try {
          const id = encodeURIComponent(str(input.spreadsheetId));
          const range = encodeURIComponent(str(input.range));
          const values = [input.values as unknown[]]; // Wrap single row
          const data = await sheetsRequest(
            auth,
            `/${id}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
            "POST",
            { values },
          );
          return {
            updatedRange: (data.updates as Record<string, unknown>)?.updatedRange,
            updatedRows: (data.updates as Record<string, unknown>)?.updatedRows,
          };
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          throw new Error(`[google_sheets.append_row] ${e.message}`, { cause: err });
        }
      },
    },
  ],
  triggers: [
    {
      name: "google_sheets.row_added",
      displayName: "Row Added",
      description: "Triggers when new rows are added to a spreadsheet",
      type: "polling",
      pollIntervalMs: 120_000, // Check every 2 minutes
      inputSchema: {
        type: "object",
        properties: {
          spreadsheetId: { type: "string", description: "Spreadsheet ID", required: true },
          range: { type: "string", description: "Sheet name (e.g. Sheet1)", required: true },
        },
        required: ["spreadsheetId", "range"],
      },
      outputSchema: {
        type: "object",
        properties: {
          rowIndex: { type: "number" },
          values: { type: "array" },
        },
      },
      poll: async (config, auth, lastState) => {
        const id = encodeURIComponent(str(config.spreadsheetId));
        const range = encodeURIComponent(str(config.range));
        const data = await sheetsRequest(auth, `/${id}/values/${range}?majorDimension=ROWS`);
        const allRows = (data.values ?? []) as unknown[][];
        const lastKnownCount = (lastState as number) ?? allRows.length;

        // Guard against row deletions: clamp lastKnownCount to current row count
        const adjustedCount = Math.min(lastKnownCount, allRows.length);
        const newRows = allRows.slice(adjustedCount);
        const items = newRows.map((row, i) => ({
          rowIndex: adjustedCount + i + 1,
          values: row,
        }));

        return { items, newState: allRows.length };
      },
    },
  ],
};

registerIntegration(definition);
