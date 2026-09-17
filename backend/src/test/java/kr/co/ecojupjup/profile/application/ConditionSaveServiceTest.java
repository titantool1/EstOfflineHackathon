package kr.co.ecojupjup.profile.application;

import static org.assertj.core.api.Assertions.*;import static org.mockito.Mockito.*;
import java.util.*;import kr.co.ecojupjup.profile.facts.PrivateFactsStore;import org.junit.jupiter.api.Test;

class ConditionSaveServiceTest {
 @Test void exactReceiptReplayDoesNotApplyFactsAgain(){
  UUID owner=UUID.randomUUID(),attempt=UUID.randomUUID(),conversation=UUID.randomUUID();byte[] canonical={1,2,3};
  var receipts=mock(ConditionSaveReceiptStore.class);var mapper=mock(ConditionSaveMapper.class);var facts=mock(PrivateFactsStore.class);
  when(receipts.find(owner,attempt)).thenReturn(Optional.of(new ConditionSaveReceiptStore.Receipt(conversation,canonical)));
  new ConditionSaveService(receipts,mapper,facts).save(owner,new ConditionSaveCommand(conversation,owner,attempt,List.of(),canonical));
  verify(receipts).lockOwner(owner);verifyNoInteractions(mapper,facts);verify(receipts,never()).save(any(),any(),any(),any());
 }
 @Test void reusedAttemptWithDifferentConversationIsRejected(){
  UUID owner=UUID.randomUUID(),attempt=UUID.randomUUID();var receipts=mock(ConditionSaveReceiptStore.class);when(receipts.find(eq(owner),eq(attempt))).thenReturn(Optional.of(new ConditionSaveReceiptStore.Receipt(UUID.randomUUID(),new byte[]{1})));
  assertThatThrownBy(()->new ConditionSaveService(receipts,mock(ConditionSaveMapper.class),mock(PrivateFactsStore.class)).save(owner,new ConditionSaveCommand(UUID.randomUUID(),owner,attempt,List.of(),new byte[]{1}))).isInstanceOf(ConditionSaveMapper.InvalidChange.class);
 }
}
