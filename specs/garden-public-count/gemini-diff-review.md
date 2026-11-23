No bugs found.

### Verification Summary
- **`getGarden` call sites**: All three callers — [page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/garden/page.tsx#L9), [GardenMini.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/garden/GardenMini.tsx#L15), and [ProfileCard.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/profile/ProfileCard.tsx#L45) — pass `await isLoggedIn()`, and [garden.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/garden.ts#L91-L105) safely defaults `includePrivate = false`.
- **`getStats` call sites**: Both callers — [ProfileCard.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/profile/ProfileCard.tsx#L45) and [TagSidebar.tsx](file:///Users/jeong-ilin/study/dailybit/src/components/bits/TagSidebar.tsx#L8) (invoked from [page.tsx](file:///Users/jeong-ilin/study/dailybit/src/app/page.tsx#L77) with `isLoggedIn={loggedIn}`) — pass the flag, and both `count` and `findMany` in [garden.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/garden.ts#L131-L138) filter `{ private: false }` for visitors.
- **Other count/date surfaces**:
  - [by-date/route.ts](file:///Users/jeong-ilin/study/dailybit/src/app/api/bits/by-date/route.ts#L13) already passes `await isLoggedIn()` to `getBitsByDateKST`.
  - Thread bit counts in [threads.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/threads.ts#L30-L37) and feed card `BIT_SELECT` in [bits.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/bits.ts#L90) already exclude private bits for visitors.
  - Tag counts in [bits.ts](file:///Users/jeong-ilin/study/dailybit/src/lib/bits.ts#L234-L253) filter `{ private: false }` and private tags when `!includePrivate`.
