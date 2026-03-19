import {
  isDirectionLikePrefix,
  isExactDirectionToken,
} from './cli-suggestion-grammar-helpers';
import { getRoomReferenceResolution, getRoomReferenceResolutionWithFallback, type RoomSlotSuggestionHelpers } from './cli-suggestion-room-slots';
import type { ActiveFragment, CliSuggestion, SuggestionResolution } from './cli-suggestion-types';
import type { MapDocument } from './map-types';

interface RoomSlotWithFallbackOptions {
  readonly input: string;
  readonly fragment: ActiveFragment;
  readonly doc: MapDocument | null;
  readonly slotStartTokenIndex: number;
  readonly fallbackSuggestions: readonly CliSuggestion[];
  readonly reservedTailTokens: readonly string[];
  readonly roomSlotSuggestionHelpers: RoomSlotSuggestionHelpers;
}

export function getRoomSlotWithFallbackResolution(
  options: RoomSlotWithFallbackOptions,
): SuggestionResolution | null {
  const {
    input,
    fragment,
    doc,
    slotStartTokenIndex,
    fallbackSuggestions,
    reservedTailTokens,
    roomSlotSuggestionHelpers,
  } = options;
  const prefix = fragment.prefix;
  const lastPrecedingToken = fragment.precedingTokens.at(-1) ?? null;
  const lastToken = lastPrecedingToken?.value.toLowerCase() ?? null;
  const lastTokenIsQuoted = lastPrecedingToken?.quoted ?? false;

  if (fragment.tokenIndex === slotStartTokenIndex) {
    return getRoomReferenceResolution(input, fragment, doc, slotStartTokenIndex, roomSlotSuggestionHelpers);
  }

  if (
    lastToken !== null
    && (
      lastTokenIsQuoted
      || (
        !isExactDirectionToken(lastToken)
        && !reservedTailTokens.includes(lastToken)
      )
    )
    && (prefix.length === 0 || !isDirectionLikePrefix(prefix))
  ) {
    return getRoomReferenceResolutionWithFallback(
      input,
      fragment,
      doc,
      slotStartTokenIndex,
      fallbackSuggestions,
      roomSlotSuggestionHelpers,
    );
  }

  return null;
}
