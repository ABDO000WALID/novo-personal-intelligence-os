import {
  ITaskRepository,
  IGoalRepository,
  INoteRepository,
  IFocusRepository,
  IMoneyRepository,
  IChatRepository,
  IKnowledgeRepository,
} from './interfaces';

import {
  LocalTaskRepository,
  LocalGoalRepository,
  LocalNoteRepository,
  LocalFocusRepository,
  LocalMoneyRepository,
  LocalChatRepository,
  LocalKnowledgeRepository,
} from './repositories/local';

import {
  FirebaseTaskRepository,
  FirebaseGoalRepository,
  FirebaseNoteRepository,
  FirebaseFocusRepository,
  FirebaseMoneyRepository,
  FirebaseChatRepository,
  FirebaseKnowledgeRepository,
} from './repositories/firebase';

export type DataSourceMode = 'local' | 'firebase';

export class RepositoryFactory {
  private static mode: DataSourceMode = 'local';

  static setDataSource(newMode: DataSourceMode) {
    RepositoryFactory.mode = newMode;
  }

  static getDataSource(): DataSourceMode {
    return RepositoryFactory.mode;
  }

  static getTaskRepository(): ITaskRepository {
    return RepositoryFactory.mode === 'firebase' ? new FirebaseTaskRepository() : new LocalTaskRepository();
  }

  static getGoalRepository(): IGoalRepository {
    return RepositoryFactory.mode === 'firebase' ? new FirebaseGoalRepository() : new LocalGoalRepository();
  }

  static getNoteRepository(): INoteRepository {
    return RepositoryFactory.mode === 'firebase' ? new FirebaseNoteRepository() : new LocalNoteRepository();
  }

  static getFocusRepository(): IFocusRepository {
    return RepositoryFactory.mode === 'firebase' ? new FirebaseFocusRepository() : new LocalFocusRepository();
  }

  static getMoneyRepository(): IMoneyRepository {
    return RepositoryFactory.mode === 'firebase' ? new FirebaseMoneyRepository() : new LocalMoneyRepository();
  }

  static getChatRepository(): IChatRepository {
    return RepositoryFactory.mode === 'firebase' ? new FirebaseChatRepository() : new LocalChatRepository();
  }

  static getKnowledgeRepository(): IKnowledgeRepository {
    return RepositoryFactory.mode === 'firebase' ? new FirebaseKnowledgeRepository() : new LocalKnowledgeRepository();
  }
}
