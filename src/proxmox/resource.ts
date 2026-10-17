import type { Credentials } from "@distilled.cloud/proxmox/Credentials";
import type * as HttpClient from "effect/http/HttpClient";

export type PveRequirements = Credentials | HttpClient.HttpClient;
export type PveForm = Record<string, string | readonly string[] | undefined>;
