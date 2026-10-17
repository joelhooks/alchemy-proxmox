import * as Provider from "alchemy/Provider";
import * as Layer from "effect/Layer";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import type { Credentials } from "./credentials.ts";
import { CredentialsFromEnv } from "./credentials.ts";
import { Lxc, LxcProvider } from "./proxmox/lxc.ts";
import { Vm, VmProvider } from "./proxmox/qemu.ts";

export class Providers extends Provider.ProviderCollection<Providers>()("Proxmox") {}

export type ProviderRequirements = Layer.Services<ReturnType<typeof providers>>;

/** Pass credentials(config) for explicit config, or use PROXMOX_* environment variables. */
export const providers = (credentials: Layer.Layer<Credentials> = CredentialsFromEnv) =>
  Layer.effect(Providers, Provider.collection([Lxc, Vm])).pipe(
    Layer.provide(Layer.mergeAll(LxcProvider(), VmProvider())),
    Layer.provideMerge(credentials),
    Layer.provideMerge(FetchHttpClient.layer),
  );
