package kr.co.ecojupjup.profile.application;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class InterestServiceTest {
    static final UUID OWNER = UUID.fromString("00000000-0000-4000-8000-000000000001");
    static final List<InterestProfile.Option> OPTIONS = List.of(
            new InterestProfile.Option("eco-learning", "환경 체험·배우기", "교육·체험·기후행동"),
            new InterestProfile.Option("green-mobility", "교통비·친환경 이동", "대중교통·자전거·친환경차"),
            new InterestProfile.Option("unsure", "아직 잘 모르겠어요", "분야별 추천"));
    InterestService.Store store;
    InterestService service;

    @BeforeEach void setup() {
        store = mock(InterestService.Store.class);
        service = new InterestService(store);
        when(store.findOptions()).thenReturn(OPTIONS);
    }

    @Test void readsTheOwnersSelectionInOptionOrder() {
        when(store.findInterestIds(OWNER)).thenReturn(List.of("green-mobility", "eco-learning"));
        InterestProfile result = service.get(OWNER);
        assertEquals(List.of("eco-learning", "green-mobility"), result.interestIds());
        assertSame(OPTIONS, result.options());
        verify(store).findInterestIds(OWNER);
    }

    @Test void validReplacementLocksTheOwnerThenReplacesTheWholeSelection() {
        InterestProfile result = service.replace(OWNER, List.of("green-mobility", "eco-learning"));
        assertEquals(List.of("eco-learning", "green-mobility"), result.interestIds());
        var order = inOrder(store);
        order.verify(store).lockOwner(OWNER);
        order.verify(store).replace(OWNER, List.of("green-mobility", "eco-learning"));

        service.replace(OWNER, List.of());
        verify(store).replace(OWNER, List.of());
    }

    @Test void duplicateUnknownNullAndMixedUnsureNeverChangeThePriorSelection() {
        for (List<String> invalid : List.of(
                List.of("eco-learning", "eco-learning"),
                List.of("not-in-catalog"),
                java.util.Arrays.asList("eco-learning", null),
                List.of("unsure", "eco-learning"))) {
            assertThrows(IllegalArgumentException.class, () -> service.replace(OWNER, invalid));
        }
        assertThrows(IllegalArgumentException.class, () -> service.replace(OWNER, null));
        verify(store, never()).lockOwner(any());
        verify(store, never()).replace(any(), any());
    }

    @Test void unsureAloneIsAnExplicitSelection() {
        assertEquals(List.of("unsure"), service.replace(OWNER, List.of("unsure")).interestIds());
        verify(store).replace(OWNER, List.of("unsure"));
    }
}
