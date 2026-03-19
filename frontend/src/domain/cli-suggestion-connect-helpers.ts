import {
  isDirectionLikePrefix,
  isExactDirectionToken,
  suggestionResolution,
} from './cli-suggestion-grammar-helpers';
import { getParserNextSymbolsForFragment } from './cli-suggestion-parser-helpers';
import {
  createDirectionSuggestions,
  createKeywordSuggestions,
} from './cli-suggestion-options';
import {
  getRoomReferenceResolution,
  getRoomReferenceResolutionWithFallback,
  type RoomSlotSuggestionHelpers,
} from './cli-suggestion-room-slots';
import type { ActiveFragment, SuggestionResolution } from './cli-suggestion-types';
import type { MapDocument } from './map-types';

interface ConnectResolutionDependencies {
  readonly roomSlotSuggestionHelpers: RoomSlotSuggestionHelpers;
  readonly getCreateAndConnectIntroResolution: (
    input: string,
    fragment: ActiveFragment,
    doc: MapDocument | null,
    tokens: readonly string[],
    lastToken: string | null,
    canonicalLastDirection: string | null,
  ) => SuggestionResolution;
}

export function getParserBackedConnectTailResolution(
  fragment: ActiveFragment,
  canonicalLastDirection: string | null,
): SuggestionResolution | null {
  const nextSymbols = getParserNextSymbolsForFragment(fragment);
  const hasOneWayPhrase = nextSymbols.some(
    (entry) => entry.symbol.kind === 'phrase'
      && entry.symbol.text === 'one-way'
      && (
        entry.sourceStateIds.includes('CONNECT_DIRECTION')
        || entry.sourceStateIds.includes('CREATE_AND_CONNECT_DIRECTION')
      ),
  );
  const hasToKeyword = nextSymbols.some(
    (entry) => entry.symbol.kind === 'keyword'
      && entry.symbol.text === 'to'
      && (
        entry.sourceStateIds.includes('CONNECT_DIRECTION')
        || entry.sourceStateIds.includes('CONNECT_ONE_WAY')
        || entry.sourceStateIds.includes('CREATE_AND_CONNECT_DIRECTION')
        || entry.sourceStateIds.includes('CREATE_AND_CONNECT_ONE_WAY')
      ),
  );

  if (!hasOneWayPhrase && !hasToKeyword && canonicalLastDirection !== null) {
    return suggestionResolution(createKeywordSuggestions(fragment.prefix, ['one-way', 'to']));
  }

  if (
    !hasOneWayPhrase
    && !hasToKeyword
    && (fragment.precedingTokens.at(-1)?.value.toLowerCase() === 'one-way'
      || fragment.precedingTokens.at(-1)?.value.toLowerCase() === 'oneway'
      || fragment.precedingTokens.at(-1)?.value.toLowerCase() === 'way')
  ) {
    return suggestionResolution(createKeywordSuggestions(fragment.prefix, ['to']));
  }

  if (!hasOneWayPhrase && !hasToKeyword) {
    return null;
  }

  return suggestionResolution([
    ...(hasOneWayPhrase ? createKeywordSuggestions(fragment.prefix, ['one-way']) : []),
    ...(hasToKeyword ? createKeywordSuggestions(fragment.prefix, ['to']) : []),
  ]);
}

export function getConnectCommandResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  tokens: readonly string[],
  lastToken: string | null,
  canonicalLastDirection: string | null,
  dependencies: ConnectResolutionDependencies,
): SuggestionResolution {
  const prefix = fragment.prefix;
  const lastPrecedingToken = fragment.precedingTokens.at(-1) ?? null;
  const lastTokenIsQuoted = lastPrecedingToken?.quoted ?? false;
  const isCreateAndConnectIntro = tokens[0] === 'create'
    && tokens[1] === 'and'
    && (tokens[2] === 'connect' || tokens[2] === 'con');
  if (isCreateAndConnectIntro) {
    return dependencies.getCreateAndConnectIntroResolution(
      input,
      fragment,
      doc,
      tokens,
      lastToken,
      canonicalLastDirection,
    );
  }

  const toIndex = tokens.indexOf('to');
  if (toIndex !== -1) {
    if (lastToken !== null && isExactDirectionToken(lastToken) && fragment.tokenIndex > toIndex + 1) {
      return suggestionResolution([]);
    }

    if (
      fragment.tokenIndex === toIndex + 1
      || (prefix.length > 0 && lastToken !== null && tokens.indexOf(lastToken) > toIndex && isDirectionLikePrefix(prefix))
    ) {
      return getRoomReferenceResolution(input, fragment, doc, toIndex + 1, dependencies.roomSlotSuggestionHelpers);
    }

    if (fragment.tokenIndex > toIndex + 1) {
      const hasOneWayMarker = tokens.includes('one-way') || tokens.includes('oneway');
      if (hasOneWayMarker) {
        return suggestionResolution([]);
      }

      return suggestionResolution(createDirectionSuggestions(prefix));
    }

    return getRoomReferenceResolution(input, fragment, doc, toIndex + 1, dependencies.roomSlotSuggestionHelpers);
  }

  if (fragment.tokenIndex === 1) {
    return getRoomReferenceResolution(input, fragment, doc, 1, dependencies.roomSlotSuggestionHelpers);
  }

  if (
    lastToken !== null
    && (
      lastTokenIsQuoted
      || (
        !isExactDirectionToken(lastToken)
        && lastToken !== 'one-way'
        && lastToken !== 'oneway'
        && lastToken !== 'way'
        && lastToken !== 'to'
      )
    )
    && (prefix.length === 0 || !isDirectionLikePrefix(prefix))
  ) {
    const sourceRoomResolution = getRoomReferenceResolutionWithFallback(
      input,
      fragment,
      doc,
      1,
      createDirectionSuggestions(prefix),
      dependencies.roomSlotSuggestionHelpers,
    );
    if (sourceRoomResolution.suggestions.length > 0) {
      return sourceRoomResolution;
    }
  }

  const parserBackedConnectTailResolution = getParserBackedConnectTailResolution(fragment, canonicalLastDirection);
  if (parserBackedConnectTailResolution !== null) {
    return parserBackedConnectTailResolution;
  }

  if (tokens.length > 1 && (prefix.length === 0 || isDirectionLikePrefix(prefix))) {
    return suggestionResolution(createDirectionSuggestions(prefix));
  }

  if (tokens.length > 1 && prefix.length > 0) {
    return suggestionResolution([]);
  }

  return suggestionResolution(createKeywordSuggestions(prefix, ['one-way', 'to']));
}
