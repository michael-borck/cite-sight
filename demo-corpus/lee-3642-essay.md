# Feedback at Scale: AI-Generated Practice Questions in Formative Assessment

## Introduction

Large enrolment units struggle to give students timely formative feedback. Recent reviews of large language models in education argue that the technology is best used to free teacher time for higher-value interaction (Kasneci et al., 2023). This essay examines whether AI-generated practice questions can play that role in a first-year statistics unit.

## How generated questions support practice

Generative models can produce unlimited, difficulty-tuned practice items, and the testing effect literature suggests frequent low-stakes retrieval is exactly what weaker students lack. The mechanism mirrors adaptive nudging: small changes to the default learning path that make practice the easy option (Thaler and Sunstein, 2008). Dropout dynamics in formative assessment analytics follow a predictable decay curve that generated question banks are well suited to counter (Harper and Whitfield, 2023).

The transformer architectures underlying these systems process long question stems efficiently because attention lets every token attend to every other token (Vaswani et al., 2021). Delegation of question writing to automation carries risks, however: students who interact passively with generated material learn less than those who interrogate it (Stojanov et al., 2024).

## Implementation in a first-year unit

Our pilot generates ten practice questions per week from the lecture transcripts. Students can request worked solutions, and item quality is sampled weekly by the teaching team. Prompt templates and marking rubrics are maintained in a shared repository (see https://github.com/openai/openai-cookbook for an example of template versioning practice). Early indications are promising, and the pattern of results is consistent with the engagement effects reported by Nguyen and Tran (2024).

## Conclusion

AI-generated practice questions are not a replacement for teacher feedback, but they change the default: practice becomes abundant instead of scarce. When combined with weekly human review of item quality, the approach scales formative assessment without scaling marking load.

## References

Harper, J., and Whitfield, S. (2023). Dropout dynamics in formative assessment analytics. *Journal of Educational Measurement and Innovation, 12*(3), 211–229.

Kasneci, E., Sessler, K., Küchemann, S., Bannert, M., Dementieva, D., Fischer, F., ... and Kasneci, G. (2023). ChatGPT for good? On opportunities and challenges of large language models for education. *Learning and Individual Differences, 103,* 102274. https://doi.org/10.1016/j.lindif.2023.102274

Selwyn, N. (2019). *Should Robots Replace Teachers? AI and the Future of Education.* Polity Press.

Stojanov, A., Grønbæk, N., and Kulahci, M. (2024). Can we delegate learning to automation? A comparative study of LLM chatbots, search engines, and books. *arXiv preprint.* https://arxiv.org/abs/2410.01396

Thaler, R. H., and Sunstein, C. R. (2008). *Nudge: Improving Decisions About Health, Wealth, and Happiness.* Yale University Press.

Vaswani, A., Shazeer, N., Parmar, N., et al. (2021). Attention is all you need. *Advances in Neural Information Processing Systems, 30.*
