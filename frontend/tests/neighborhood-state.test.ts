import test from "node:test";
import assert from "node:assert/strict";
import { initialNeighborhoodState, neighborhoodReducer } from "../src/features/profile/neighborhood-state.ts";

const first = { regionCode: "1230059000", sido: "전남광주통합특별시", sigungu: "북구", dong: "용봉동" };
const second = { regionCode: "1111061500", sido: "서울특별시", sigungu: "종로구", dong: "종로1·2·3·4가동" };
const result = (candidate: typeof first) => ({ candidates: [candidate], hasMore: false, emptyReason: null as null });

test("selecting a candidate does not save until save success is explicit", () => {
  let state = neighborhoodReducer(initialNeighborhoodState, { type: "loaded", neighborhood: first });
  state = neighborhoodReducer(state, { type: "begin", request: 1 });
  state = neighborhoodReducer(state, { type: "resolved", request: 1, result: result(second) });
  state = neighborhoodReducer(state, { type: "select", neighborhood: second });
  assert.deepEqual(state.selected, second); assert.deepEqual(state.saved, first);
  state = neighborhoodReducer(state, { type: "saved", neighborhood: second });
  assert.deepEqual(state.saved, second); assert.equal(state.selected, null);
});

test("input change and a newer request ignore late search or GPS results", () => {
  let state = neighborhoodReducer(initialNeighborhoodState, { type: "begin", request: 1 });
  state = neighborhoodReducer(state, { type: "invalidate", request: 2 });
  const invalidated = state;
  state = neighborhoodReducer(state, { type: "resolved", request: 1, result: result(first) });
  assert.strictEqual(state, invalidated);
  state = neighborhoodReducer(state, { type: "begin", request: 3 });
  state = neighborhoodReducer(state, { type: "resolved", request: 2, result: result(first) });
  assert.equal(state.resolving, true); assert.deepEqual(state.candidates, []);
  state = neighborhoodReducer(state, { type: "resolved", request: 3, result: result(second) });
  assert.deepEqual(state.candidates, [second]);
});
