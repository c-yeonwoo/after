import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { AssistantConversation } from "./AssistantConversation";
import { useAssistantFlags } from "@/lib/useAssistantFlags";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** A conversation overlay keeps the profile form mounted, including unsaved changes. */
export function ProfileManagerChat({ owner }: { owner: string }) {
  const flags = useAssistantFlags(owner);
  const [question, setQuestion] = useState("");
  if (!flags.data?.chat || flags.isError || flags.isPaused) return null;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" aria-label="프로필 매니저에게 물어보기" className="gap-2">
          <MessageCircle className="size-4" aria-hidden="true" />
          매니저
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[min(46rem,90dvh)] w-[calc(100%-1rem)] max-w-lg flex-col gap-3 overflow-hidden p-0">
        <div className="px-4 pt-5 pr-14">
          <DialogTitle>쓰다가 막히면, 매니저에게</DialogTitle>
          <DialogDescription className="mt-2">
            저장된 프로필을 함께 읽어요. 수정 중인 문장은 대화에 붙여 주세요. 닫아도 편집 내용은
            그대로예요.
          </DialogDescription>
        </div>
        <AssistantConversation
          owner={owner}
          embedded
          showIdentity={false}
          initialQuestion={question}
          onDraftChange={setQuestion}
        />
      </DialogContent>
    </Dialog>
  );
}
