/**
 * Branded ID types for type safety across the system.
 * Using branded types prevents mixing incompatible IDs.
 */

/** Base UUID type with brand */
export type UUID = string & { readonly __uuidBrand: unique symbol };

// Session identifiers
export type SessionId = UUID;
export type TurnId = number;

// Event identifiers
export type EventId = UUID;
export type ToolCallId = UUID;

// World identifiers
export type WorldId = UUID;
export type TimelineId = UUID;
export type EntityId = UUID;

// Identity identifiers
export type CanonicalUserId = UUID;
export type PlatformIdentityId = string; // Platform-specific, not necessarily UUID

// Capability identifiers
export type CapabilityTag = string;
export type ToolId = string;
export type ServerId = UUID;

// Hash types
export type EventHash = string;
