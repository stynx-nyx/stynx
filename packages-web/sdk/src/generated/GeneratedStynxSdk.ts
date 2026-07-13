/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseHttpRequest } from './core/BaseHttpRequest';
import type { OpenAPIConfig } from './core/OpenAPI';
import { FetchHttpRequest } from './core/FetchHttpRequest';
import { DocumentsService } from './services/DocumentsService';
import { FlowAgentRulesService } from './services/FlowAgentRulesService';
import { FlowAnalyticsService } from './services/FlowAnalyticsService';
import { FlowAnswersService } from './services/FlowAnswersService';
import { FlowEdgesService } from './services/FlowEdgesService';
import { FlowEffectsService } from './services/FlowEffectsService';
import { FlowEventsService } from './services/FlowEventsService';
import { FlowFillsService } from './services/FlowFillsService';
import { FlowFormsService } from './services/FlowFormsService';
import { FlowGraphsService } from './services/FlowGraphsService';
import { FlowNodeFormRulesService } from './services/FlowNodeFormRulesService';
import { FlowNodeRunsService } from './services/FlowNodeRunsService';
import { FlowNodesService } from './services/FlowNodesService';
import { FlowPoliciesService } from './services/FlowPoliciesService';
import { FlowQuestionsService } from './services/FlowQuestionsService';
import { FlowRunsService } from './services/FlowRunsService';
import { FlowScopesService } from './services/FlowScopesService';
import { FlowSignalService } from './services/FlowSignalService';
import { FlowTasksService } from './services/FlowTasksService';
import { FlowTransitionEffectsService } from './services/FlowTransitionEffectsService';
import { FlowWaiversService } from './services/FlowWaiversService';
import { I18NService } from './services/I18NService';
import { PreferencesService } from './services/PreferencesService';
import { PrivacyService } from './services/PrivacyService';
import { RecordNotesService } from './services/RecordNotesService';
import { RecordsService } from './services/RecordsService';
import { ReferenceDevAuthService } from './services/ReferenceDevAuthService';
import { ReferenceProbesService } from './services/ReferenceProbesService';
import { SessionControlService } from './services/SessionControlService';
import { SessionJwksService } from './services/SessionJwksService';
import { StynxAuditService } from './services/StynxAuditService';
import { StynxAuthService } from './services/StynxAuthService';
import { StynxHealthService } from './services/StynxHealthService';
import { TenancyService } from './services/TenancyService';
import { WorkItemEntriesService } from './services/WorkItemEntriesService';
import { WorkItemLocksService } from './services/WorkItemLocksService';
import { WorkItemsService } from './services/WorkItemsService';
type HttpRequestConstructor = new (config: OpenAPIConfig) => BaseHttpRequest;
export class GeneratedStynxSdk {
    public readonly documents: DocumentsService;
    public readonly flowAgentRules: FlowAgentRulesService;
    public readonly flowAnalytics: FlowAnalyticsService;
    public readonly flowAnswers: FlowAnswersService;
    public readonly flowEdges: FlowEdgesService;
    public readonly flowEffects: FlowEffectsService;
    public readonly flowEvents: FlowEventsService;
    public readonly flowFills: FlowFillsService;
    public readonly flowForms: FlowFormsService;
    public readonly flowGraphs: FlowGraphsService;
    public readonly flowNodeFormRules: FlowNodeFormRulesService;
    public readonly flowNodeRuns: FlowNodeRunsService;
    public readonly flowNodes: FlowNodesService;
    public readonly flowPolicies: FlowPoliciesService;
    public readonly flowQuestions: FlowQuestionsService;
    public readonly flowRuns: FlowRunsService;
    public readonly flowScopes: FlowScopesService;
    public readonly flowSignal: FlowSignalService;
    public readonly flowTasks: FlowTasksService;
    public readonly flowTransitionEffects: FlowTransitionEffectsService;
    public readonly flowWaivers: FlowWaiversService;
    public readonly i18N: I18NService;
    public readonly preferences: PreferencesService;
    public readonly privacy: PrivacyService;
    public readonly recordNotes: RecordNotesService;
    public readonly records: RecordsService;
    public readonly referenceDevAuth: ReferenceDevAuthService;
    public readonly referenceProbes: ReferenceProbesService;
    public readonly sessionControl: SessionControlService;
    public readonly sessionJwks: SessionJwksService;
    public readonly stynxAudit: StynxAuditService;
    public readonly stynxAuth: StynxAuthService;
    public readonly stynxHealth: StynxHealthService;
    public readonly tenancy: TenancyService;
    public readonly workItemEntries: WorkItemEntriesService;
    public readonly workItemLocks: WorkItemLocksService;
    public readonly workItems: WorkItemsService;
    public readonly request: BaseHttpRequest;
    constructor(config?: Partial<OpenAPIConfig>, HttpRequest: HttpRequestConstructor = FetchHttpRequest) {
        this.request = new HttpRequest({
            BASE: config?.BASE ?? '',
            VERSION: config?.VERSION ?? '0.2.0',
            WITH_CREDENTIALS: config?.WITH_CREDENTIALS ?? false,
            CREDENTIALS: config?.CREDENTIALS ?? 'include',
            TOKEN: config?.TOKEN,
            USERNAME: config?.USERNAME,
            PASSWORD: config?.PASSWORD,
            HEADERS: config?.HEADERS,
            ENCODE_PATH: config?.ENCODE_PATH,
        });
        this.documents = new DocumentsService(this.request);
        this.flowAgentRules = new FlowAgentRulesService(this.request);
        this.flowAnalytics = new FlowAnalyticsService(this.request);
        this.flowAnswers = new FlowAnswersService(this.request);
        this.flowEdges = new FlowEdgesService(this.request);
        this.flowEffects = new FlowEffectsService(this.request);
        this.flowEvents = new FlowEventsService(this.request);
        this.flowFills = new FlowFillsService(this.request);
        this.flowForms = new FlowFormsService(this.request);
        this.flowGraphs = new FlowGraphsService(this.request);
        this.flowNodeFormRules = new FlowNodeFormRulesService(this.request);
        this.flowNodeRuns = new FlowNodeRunsService(this.request);
        this.flowNodes = new FlowNodesService(this.request);
        this.flowPolicies = new FlowPoliciesService(this.request);
        this.flowQuestions = new FlowQuestionsService(this.request);
        this.flowRuns = new FlowRunsService(this.request);
        this.flowScopes = new FlowScopesService(this.request);
        this.flowSignal = new FlowSignalService(this.request);
        this.flowTasks = new FlowTasksService(this.request);
        this.flowTransitionEffects = new FlowTransitionEffectsService(this.request);
        this.flowWaivers = new FlowWaiversService(this.request);
        this.i18N = new I18NService(this.request);
        this.preferences = new PreferencesService(this.request);
        this.privacy = new PrivacyService(this.request);
        this.recordNotes = new RecordNotesService(this.request);
        this.records = new RecordsService(this.request);
        this.referenceDevAuth = new ReferenceDevAuthService(this.request);
        this.referenceProbes = new ReferenceProbesService(this.request);
        this.sessionControl = new SessionControlService(this.request);
        this.sessionJwks = new SessionJwksService(this.request);
        this.stynxAudit = new StynxAuditService(this.request);
        this.stynxAuth = new StynxAuthService(this.request);
        this.stynxHealth = new StynxHealthService(this.request);
        this.tenancy = new TenancyService(this.request);
        this.workItemEntries = new WorkItemEntriesService(this.request);
        this.workItemLocks = new WorkItemLocksService(this.request);
        this.workItems = new WorkItemsService(this.request);
    }
}

